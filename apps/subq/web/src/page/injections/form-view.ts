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
import type { Html, HtmlBuilder } from 'foldkit/html'

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

const makeViewInjectionForm = <ParentMessage>(h: HtmlBuilder<ParentMessage | InjectionsMessage>) => {
  const viewOffScheduleWarning = (form: InjectionForm, schedules: ReadonlyArray<Schedule>) => {
    if (!isOffScheduleDose(form, schedules)) {
      return h.empty
    }

    const doseMgs = scheduleDoseMgs(selectedSchedule(schedules, form))

    return h.div(
      [h.Class('mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg')],
      [
        h.div(
          [h.Class('flex items-start gap-2')],
          [
            h.div(
              [h.Class('flex-1')],
              [
                h.p([h.Class('text-sm font-medium text-amber-600')], ['Off-schedule dose']),
                h.p(
                  [h.Class('text-xs text-muted-foreground mt-1')],
                  [
                    `This dose (${form.doseMg} mg) does not match your schedule phases (${Arr.join(
                      Arr.map(doseMgs, (dose) => `${dose} mg`),
                      ', '
                    )}).`,
                  ]
                ),
                form.confirmedOffSchedule
                  ? h.p([h.Class('mt-1 text-xs text-amber-600')], ['Confirmed - will log as entered'])
                  : h.button(
                      [
                        h.Class('mt-2 text-xs text-amber-600 hover:underline font-medium'),
                        h.Type('button'),
                        h.OnClick(ConfirmedInjectionOffSchedule()),
                      ],
                      ['Log anyway']
                    ),
              ]
            ),
          ]
        ),
      ]
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

    return h.div(
      [h.Class(card({ class: 'mb-6 p-6' }))],
      [
        h.form(
          [h.OnSubmit(SubmittedInjectionForm())],
          [
            h.div(
              [h.Class('mb-4')],
              [
                h.label(
                  [h.For('injection-datetime'), h.Class('mb-2 block text-sm font-medium')],
                  ['Date & Time ', h.span([h.Class('text-destructive')], ['*'])]
                ),
                h.input([
                  h.Class(input()),
                  h.Type('datetime-local'),
                  h.Id('injection-datetime'),
                  h.Value(form.datetime),
                  h.Max(form.maxDatetime),
                  h.OnInput((value) => ChangedInjectionDatetime({ value })),
                ]),
              ]
            ),
            h.div(
              [h.Class('mb-4')],
              [
                h.label(
                  [h.For('injection-compound'), h.Class('mb-2 block text-sm font-medium')],
                  ['Medication ', h.span([h.Class('text-destructive')], ['*'])]
                ),
                h.select(
                  [
                    h.Class(select()),
                    h.Id('injection-compound'),
                    h.Value(form.compound),
                    h.OnChange((value) => ChangedInjectionCompound({ value })),
                  ],
                  [
                    h.option([h.Value('')], ['Select medication']),
                    ...Arr.map(listMedicationCompounds(), (compound) =>
                      h.keyed('option')(compound, [h.Value(compound)], [compound])
                    ),
                  ]
                ),
              ]
            ),
            h.div(
              [h.Class('mb-4')],
              [
                h.label([h.For('injection-schedule'), h.Class('mb-2 block text-sm font-medium')], ['Link to Schedule']),
                h.select(
                  [
                    h.Class(select()),
                    h.Id('injection-schedule'),
                    h.Value(form.scheduleId),
                    h.OnChange((value) => ChangedInjectionSchedule({ value })),
                  ],
                  [
                    h.option([h.Value('')], ['No schedule']),
                    ...Arr.map(schedules, (schedule) =>
                      h.keyed('option')(
                        schedule.id,
                        [h.Value(schedule.id)],
                        [`${schedule.name} (${schedule.compound})`]
                      )
                    ),
                  ]
                ),
              ]
            ),
            h.div(
              [h.Class('grid grid-cols-1 gap-4 mb-4 sm:grid-cols-2')],
              [
                h.div(
                  [],
                  [
                    h.label(
                      [h.For('injection-dose-mg'), h.Class('mb-2 block text-sm font-medium')],
                      ['Dose (mg) ', h.span([h.Class('text-destructive')], ['*'])]
                    ),
                    h.input([
                      h.Class(input()),
                      h.Type('number'),
                      h.Id('injection-dose-mg'),
                      h.List('injection-dose-mg-suggestions'),
                      h.Min('0'),
                      h.Step('any'),
                      h.Placeholder('e.g., 2.5'),
                      h.Value(form.doseMg),
                      h.OnInput((value) => ChangedInjectionDoseMg({ value })),
                    ]),
                    viewDatalist({ h, id: 'injection-dose-mg-suggestions', values: doseMgSuggestions }),
                  ]
                ),
                h.div(
                  [],
                  [
                    h.label([h.For('injection-supplier'), h.Class('mb-2 block text-sm font-medium')], ['Supplier']),
                    h.input([
                      h.Class(input()),
                      h.Type('text'),
                      h.Id('injection-supplier'),
                      h.Placeholder('e.g., CVS, Pharmacy'),
                      h.Value(form.supplier),
                      h.OnInput((value) => ChangedInjectionSupplier({ value })),
                    ]),
                  ]
                ),
              ]
            ),
            viewOffScheduleWarning(form, schedules),
            h.div(
              [h.Class('mb-4')],
              [
                h.label([h.For('injection-site'), h.Class('mb-2 block text-sm font-medium')], ['Injection Site']),
                h.input([
                  h.Class(input()),
                  h.Type('text'),
                  h.Id('injection-site'),
                  h.List('injection-site-suggestions'),
                  h.Placeholder('Select site (optional)'),
                  h.Value(form.site),
                  h.OnInput((value) => ChangedInjectionSite({ value })),
                ]),
                viewDatalist({ h, id: 'injection-site-suggestions', values: siteSuggestions }),
                h.p(
                  [h.Class('text-xs text-muted-foreground mt-1')],
                  ['Rotating injection sites helps prevent lipodystrophy']
                ),
              ]
            ),
            h.div(
              [h.Class('mb-4')],
              [
                h.label([h.For('injection-notes'), h.Class('mb-2 block text-sm font-medium')], ['Notes']),
                h.textarea([
                  h.Class(input({ class: 'h-auto' })),
                  h.Id('injection-notes'),
                  h.Rows(2),
                  h.Placeholder('Any side effects or observations...'),
                  h.Value(form.notes),
                  h.OnInput((value) => ChangedInjectionNotes({ value })),
                ]),
              ]
            ),
            form.error === null ? h.empty : h.p([h.Class('mb-3 text-sm text-destructive')], [form.error]),
            h.div(
              [h.Class('flex justify-end gap-3')],
              [
                h.button(
                  [h.Class(button({ variant: 'outline' })), h.Type('button'), h.OnClick(ClickedCancelInjectionForm())],
                  ['Cancel']
                ),
                h.button(
                  [
                    h.Class(button()),
                    h.Type('submit'),
                    h.Disabled(
                      form.submitting ||
                        Str.isEmpty(Str.trim(form.compound)) ||
                        Str.isEmpty(Str.trim(form.doseMg)) ||
                        needsOffScheduleConfirmation
                    ),
                  ],
                  [submitLabel]
                ),
              ]
            ),
          ]
        ),
      ]
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
  readonly h: HtmlBuilder<ParentMessage | InjectionsMessage>
}): Html => makeViewInjectionForm(h)(model, form)
