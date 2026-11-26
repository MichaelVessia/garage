import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import type { Schedule } from '@garage/subq-domain/Journal/JournalRecords'
import {
  listDefaultInjectionSites,
  listMedicationCompounds,
  suggestedDoseMgForCompound,
} from '@garage/subq-domain/MedicationVocabulary'
import { MedicationCompound } from '@garage/subq-domain/Values'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

import { viewDatalist } from '../../lib/view.ts'
import { button, card, input, select } from '../../ui.ts'
import { isOffScheduleDose, scheduleById, scheduleDoseMgs } from './form.ts'
import {
  ChangedInjectionDatetime,
  ChangedInjectionDoseMg,
  ChangedInjectionCompound,
  ChangedInjectionNotes,
  ChangedInjectionSchedule,
  ChangedInjectionSite,
  ChangedInjectionSupplier,
  ClickedCancelInjectionForm,
  ConfirmedInjectionOffSchedule,
  SubmittedInjectionForm,
} from './model.ts'
import type { InjectionForm, InjectionsMessage, InjectionsPage } from './model.ts'

const injectionSubmitLabel = (form: InjectionForm): string => {
  if (form.submitting) {
    return 'Saving...'
  }

  return form.editingId === null ? 'Save' : 'Update'
}

const selectedSchedule = (schedules: ReadonlyArray<Schedule>, form: InjectionForm): Option.Option<Schedule> =>
  scheduleById(schedules, form.scheduleId)

const makeViewInjectionForm = <ParentMessage>(h: Html.H<ParentMessage | InjectionsMessage>) => {
  const viewOffScheduleWarning = (form: InjectionForm, schedules: ReadonlyArray<Schedule>) => {
    if (!isOffScheduleDose(form, schedules)) {
      return false
    }

    const doseMgs = scheduleDoseMgs(selectedSchedule(schedules, form))

    return h.div.class('mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg').children(
      h.div.class('flex items-start gap-2').children(
        h.div.class('flex-1').children(
          h.p.class('text-sm font-medium text-amber-600').children('Off-schedule dose'),
          h.p.class('text-xs text-muted-foreground mt-1').children(
            `This dose (${form.doseMg} mg) does not match your schedule phases (${Arr.join(
              Arr.map(doseMgs, (dose) => `${dose} mg`),
              ', '
            )}).`
          ),
          form.confirmedOffSchedule
            ? h.p.class('mt-1 text-xs text-amber-600').children('Confirmed - will log as entered')
            : h.button
                .class('mt-2 text-xs text-amber-600 hover:underline font-medium')
                .attr('type', 'button')
                .on('click', ConfirmedInjectionOffSchedule())
                .children('Log anyway')
        )
      )
    )
  }

  const viewForm = (model: InjectionsPage, form: InjectionForm) => {
    const schedules = model.schedules
    const siteSuggestions = Arr.dedupe([...model.sites, ...listDefaultInjectionSites()])
    const selectedCompound = Schema.is(MedicationCompound)(form.compound) ? Option.some(form.compound) : Option.none()

    const doseMgSuggestions = Arr.map(
      Arr.dedupe([
        ...scheduleDoseMgs(selectedSchedule(schedules, form)),
        ...Option.match(selectedCompound, {
          onNone: () => [],
          onSome: suggestedDoseMgForCompound,
        }),
      ]),
      String
    )

    const submitLabel = injectionSubmitLabel(form)
    const needsOffScheduleConfirmation = isOffScheduleDose(form, schedules) && !form.confirmedOffSchedule

    return h.div.class(card({ class: 'mb-6 p-6' })).children(
      h.form.on('submit', SubmittedInjectionForm()).children(
        h.div.class('mb-4').children(
          h.label
            .attr('for', 'injection-datetime')
            .class('mb-2 block text-sm font-medium')
            .children('Date & Time ', h.span.class('text-destructive').children('*')),
          h.input
            .class(input())
            .attr('type', 'datetime-local')
            .attr('id', 'injection-datetime')
            .value(form.datetime)
            .attr('max', form.maxDatetime)
            .on('input', ({ value }) => ChangedInjectionDatetime({ value }))
        ),
        h.div.class('mb-4').children(
          h.label
            .attr('for', 'injection-compound')
            .class('mb-2 block text-sm font-medium')
            .children('Medication ', h.span.class('text-destructive').children('*')),
          h.select
            .class(select())
            .attr('id', 'injection-compound')
            .value(form.compound)
            .on('change', ({ value }) => ChangedInjectionCompound({ value }))
            .children(
              h.option.attr('value', '').children('Select medication'),
              ...Arr.map(listMedicationCompounds(), (compound) =>
                h.option.key(compound).attr('value', compound).children(compound)
              )
            )
        ),
        h.div.class('mb-4').children(
          h.label
            .attr('for', 'injection-schedule')
            .class('mb-2 block text-sm font-medium')
            .children('Link to Schedule'),
          h.select
            .class(select())
            .attr('id', 'injection-schedule')
            .value(form.scheduleId)
            .on('change', ({ value }) => ChangedInjectionSchedule({ value }))
            .children(
              h.option.attr('value', '').children('No schedule'),
              ...Arr.map(schedules, (schedule) =>
                h.option.key(schedule.id).attr('value', schedule.id).children(`${schedule.name} (${schedule.compound})`)
              )
            )
        ),
        h.div.class('grid grid-cols-1 gap-4 mb-4 sm:grid-cols-2').children(
          h.div.children(
            h.label
              .attr('for', 'injection-dose-mg')
              .class('mb-2 block text-sm font-medium')
              .children('Dose (mg) ', h.span.class('text-destructive').children('*')),
            h.input
              .class(input())
              .attr('type', 'number')
              .attr('id', 'injection-dose-mg')
              .attr('list', 'injection-dose-mg-suggestions')
              .attr('min', '0')
              .attr('step', 'any')
              .attr('placeholder', 'e.g., 2.5')
              .value(form.doseMg)
              .on('input', ({ value }) => ChangedInjectionDoseMg({ value })),
            viewDatalist({ h, id: 'injection-dose-mg-suggestions', values: doseMgSuggestions })
          ),
          h.div.children(
            h.label.attr('for', 'injection-supplier').class('mb-2 block text-sm font-medium').children('Supplier'),
            h.input
              .class(input())
              .attr('type', 'text')
              .attr('id', 'injection-supplier')
              .attr('placeholder', 'e.g., CVS, Pharmacy')
              .value(form.supplier)
              .on('input', ({ value }) => ChangedInjectionSupplier({ value }))
          )
        ),
        viewOffScheduleWarning(form, schedules),
        h.div.class('mb-4').children(
          h.label.attr('for', 'injection-site').class('mb-2 block text-sm font-medium').children('Injection Site'),
          h.input
            .class(input())
            .attr('type', 'text')
            .attr('id', 'injection-site')
            .attr('list', 'injection-site-suggestions')
            .attr('placeholder', 'Select site (optional)')
            .value(form.site)
            .on('input', ({ value }) => ChangedInjectionSite({ value })),
          viewDatalist({ h, id: 'injection-site-suggestions', values: siteSuggestions }),
          h.p
            .class('text-xs text-muted-foreground mt-1')
            .children('Rotating injection sites helps prevent lipodystrophy')
        ),
        h.div.class('mb-4').children(
          h.label.attr('for', 'injection-notes').class('mb-2 block text-sm font-medium').children('Notes'),
          h.textarea
            .class(input({ class: 'h-auto' }))
            .attr('id', 'injection-notes')
            .attr('rows', String(2))
            .attr('placeholder', 'Any side effects or observations...')
            .value(form.notes)
            .on('input', ({ value }) => ChangedInjectionNotes({ value }))
        ),
        form.error === null ? null : h.p.class('mb-3 text-sm text-destructive').children(form.error),
        h.div.class('flex justify-end gap-3').children(
          h.button
            .class(button({ variant: 'outline' }))
            .attr('type', 'button')
            .on('click', ClickedCancelInjectionForm())
            .children('Cancel'),
          h.button
            .class(button())
            .attr('type', 'submit')
            .disabled(
              form.submitting ||
                Str.isEmpty(Str.trim(form.compound)) ||
                Str.isEmpty(Str.trim(form.doseMg)) ||
                needsOffScheduleConfirmation
            )
            .children(submitLabel)
        )
      )
    )
  }

  return viewForm
}

export const viewInjectionForm = <ParentMessage>({
  form,
  h,
  model,
}: {
  readonly model: InjectionsPage
  readonly form: InjectionForm
  readonly h: Html.H<ParentMessage | InjectionsMessage>
}): View.Content<ParentMessage | InjectionsMessage> => makeViewInjectionForm(h)(model, form)
