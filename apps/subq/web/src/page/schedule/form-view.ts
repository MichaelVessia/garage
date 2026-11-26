import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import { listMedicationCompounds, suggestedDoseMgForCompound } from '@garage/subq-domain/MedicationVocabulary'
import { MedicationCompound } from '@garage/subq-domain/Values'
import * as Arr from 'effect/Array'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

import { FREQUENCIES, frequencyFromString } from '../../lib/frequency.ts'
import { viewDatalist } from '../../lib/view.ts'
import { button, card, input, select } from '../../ui.ts'
import {
  AddedSchedulePhase,
  ChangedScheduleCompound,
  ChangedScheduleFrequency,
  ChangedScheduleName,
  ChangedScheduleNotes,
  ChangedSchedulePhaseDoseMg,
  ChangedSchedulePhaseDuration,
  ChangedScheduleStartDate,
  ChangedScheduleSupplier,
  ClickedCancelScheduleForm,
  RemovedSchedulePhase,
  SubmittedScheduleForm,
  ToggledSchedulePhaseIndefinite,
} from './model.ts'
import type { ScheduleForm, ScheduleMessage } from './model.ts'

// ============================================
// Schedule form view
// ============================================

const scheduleSubmitLabel = (form: ScheduleForm): string => {
  if (form.submitting) {
    return 'Saving...'
  }

  return form.editingId === null ? 'Create Schedule' : 'Update Schedule'
}

const makeViewScheduleForm = <ParentMessage>(
  h: Html.H<ParentMessage | ScheduleMessage>
): ((form: ScheduleForm) => View.Content<ParentMessage | ScheduleMessage>) => {
  const viewPhaseEditor = (form: ScheduleForm) =>
    h.div.class('mb-4').children(
      h.div.class('flex items-center justify-between mb-2').children(
        h.label
          .class('block text-sm font-medium')
          .children('Titration Phases ', h.span.class('text-destructive').children('*')),
        h.button
          .class(button({ size: 'sm', variant: 'outline' }))
          .attr('type', 'button')
          .on('click', AddedSchedulePhase())
          .children('Add Phase')
      ),
      h.p
        .class('text-xs text-muted-foreground mb-3')
        .children('Define each phase of your titration schedule. Duration is in days (28 = ~1 month).'),
      h.div.class('space-y-3').children(
        Arr.map(form.phases, (phase, index) =>
          h.div
            .key(String(phase.order))
            .class('flex flex-col gap-3 p-3 bg-muted/50 rounded-lg sm:flex-row sm:items-center')
            .children(
              h.span.class('text-sm font-medium text-muted-foreground w-16').children(`Phase ${index + 1}`),
              h.div.class('flex-1').children(
                h.input
                  .class(input())
                  .attr('type', 'number')
                  .attr('list', 'schedule-dose-mg-suggestions')
                  .attr('min', '0')
                  .attr('step', 'any')
                  .attr('placeholder', 'Dose in mg (e.g., 2.5)')
                  .value(phase.doseMg)
                  .on('input', ({ value }) => ChangedSchedulePhaseDoseMg({ index, value }))
              ),
              h.div.class('w-full sm:w-24').children(
                h.input
                  .class(input())
                  .attr('type', 'number')
                  .attr('placeholder', 'Days')
                  .attr('min', '1')
                  .disabled(phase.isIndefinite)
                  .value(phase.durationDays)
                  .on('input', ({ value }) => ChangedSchedulePhaseDuration({ index, value }))
              ),
              index === form.phases.length - 1
                ? h.label
                    .class('flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer whitespace-nowrap')
                    .attr('title', 'Mark as ongoing maintenance phase with no end date')
                    .children(
                      h.input
                        .class('rounded border-muted-foreground/50')
                        .attr('type', 'checkbox')
                        .checked(phase.isIndefinite)
                        .on('click', ToggledSchedulePhaseIndefinite({ checked: !phase.isIndefinite, index })),
                      'Indefinite'
                    )
                : null,
              form.phases.length > 1
                ? h.button
                    .class(
                      button({
                        class: 'h-8 w-8 text-destructive hover:text-destructive',
                        size: 'icon',
                        variant: 'ghost',
                      })
                    )
                    .attr('type', 'button')
                    .on('click', RemovedSchedulePhase({ index }))
                    .children('Del')
                : null
            )
        )
      )
    )

  const viewForm = (form: ScheduleForm) => {
    const submitLabel = scheduleSubmitLabel(form)

    const doseMgSuggestions = Arr.map(
      Schema.is(MedicationCompound)(form.compound) ? suggestedDoseMgForCompound(form.compound) : [],
      String
    )

    const isValid =
      Str.trim(form.name) !== '' &&
      Str.trim(form.compound) !== '' &&
      form.startDate !== '' &&
      Arr.every(
        form.phases,
        (phase) => Str.trim(phase.doseMg) !== '' && (phase.isIndefinite || Str.trim(phase.durationDays) !== '')
      )

    return h.div.class(card({ class: 'mb-6 p-6' })).children(
      h.form.on('submit', SubmittedScheduleForm()).children(
        h.div.class('mb-4').children(
          h.label
            .attr('for', 'schedule-name')
            .class('mb-2 block text-sm font-medium')
            .children('Schedule Name ', h.span.class('text-destructive').children('*')),
          h.input
            .class(input())
            .attr('type', 'text')
            .attr('id', 'schedule-name')
            .attr('placeholder', 'e.g., Semaglutide Titration')
            .value(form.name)
            .on('input', ({ value }) => ChangedScheduleName({ value }))
        ),
        h.div.class('mb-4').children(
          h.label
            .attr('for', 'schedule-compound')
            .class('mb-2 block text-sm font-medium')
            .children('Medication ', h.span.class('text-destructive').children('*')),
          h.select
            .class(select())
            .attr('id', 'schedule-compound')
            .value(form.compound)
            .on('change', ({ value }) => ChangedScheduleCompound({ value }))
            .children(
              h.option.attr('value', '').children('Select medication'),
              ...Arr.map(listMedicationCompounds(), (compound) =>
                h.option.key(compound).attr('value', compound).children(compound)
              )
            )
        ),
        h.div.class('mb-4').children(
          h.label.attr('for', 'schedule-supplier').class('mb-2 block text-sm font-medium').children('Supplier'),
          h.input
            .class(input())
            .attr('type', 'text')
            .attr('id', 'schedule-supplier')
            .attr('placeholder', 'e.g., CVS, clinic, direct vendor')
            .value(form.supplier)
            .on('input', ({ value }) => ChangedScheduleSupplier({ value }))
        ),
        h.div.class('grid grid-cols-1 gap-4 mb-4 sm:grid-cols-2').children(
          h.div.children(
            h.label
              .attr('for', 'schedule-frequency')
              .class('mb-2 block text-sm font-medium')
              .children('Frequency ', h.span.class('text-destructive').children('*')),
            h.select
              .class(select())
              .attr('id', 'schedule-frequency')
              .value(form.frequency)
              .on('change', ({ value }) => ChangedScheduleFrequency({ value: frequencyFromString(value) }))
              .children(
                Arr.map(FREQUENCIES, ([value, label]) => h.option.key(value).attr('value', value).children(label))
              )
          ),
          h.div.children(
            h.label
              .attr('for', 'schedule-start-date')
              .class('mb-2 block text-sm font-medium')
              .children('Start Date ', h.span.class('text-destructive').children('*')),
            h.input
              .class(input())
              .attr('type', 'date')
              .attr('id', 'schedule-start-date')
              .value(form.startDate)
              .on('input', ({ value }) => ChangedScheduleStartDate({ value }))
          )
        ),
        viewPhaseEditor(form),
        viewDatalist({ h, id: 'schedule-dose-mg-suggestions', values: doseMgSuggestions }),
        h.div.class('mb-4').children(
          h.label.attr('for', 'schedule-notes').class('mb-2 block text-sm font-medium').children('Notes'),
          h.textarea
            .class(input({ class: 'h-auto' }))
            .attr('id', 'schedule-notes')
            .attr('rows', String(2))
            .attr('placeholder', 'Any additional instructions or notes...')
            .value(form.notes)
            .on('input', ({ value }) => ChangedScheduleNotes({ value }))
        ),
        form.error === null ? null : h.p.class('mb-3 text-sm text-destructive').children(form.error),
        h.div.class('flex justify-end gap-3').children(
          h.button
            .class(button({ variant: 'outline' }))
            .attr('type', 'button')
            .on('click', ClickedCancelScheduleForm())
            .children('Cancel'),
          h.button
            .class(button())
            .attr('type', 'submit')
            .disabled(form.submitting || !isValid)
            .children(submitLabel)
        )
      )
    )
  }

  return viewForm
}

export const viewScheduleForm = <ParentMessage>({
  form,
  h,
}: {
  readonly form: ScheduleForm
  readonly h: Html.H<ParentMessage | ScheduleMessage>
}): View.Content<ParentMessage | ScheduleMessage> => makeViewScheduleForm(h)(form)
