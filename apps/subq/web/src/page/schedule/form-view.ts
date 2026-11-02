import * as Arr from 'effect/Array'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { MedicationCompound, listMedicationCompounds, suggestedDoseMgForCompound } from '#shared'

import { FREQUENCIES, frequencyFromString } from '../../lib/frequency.js'
import { viewDatalist } from '../../lib/view.js'
import { button, card, input, select } from '../../ui.js'
import {
  AddedSchedulePhase,
  ChangedScheduleDrug,
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
} from './model.js'
import type { ScheduleForm, ScheduleMessage } from './model.js'

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
  h: HtmlBuilder<ParentMessage | ScheduleMessage>
): ((form: ScheduleForm) => Html) => {
  const viewPhaseEditor = (form: ScheduleForm) =>
    h.div(
      [h.Class('mb-4')],
      [
        h.div(
          [h.Class('flex items-center justify-between mb-2')],
          [
            h.label(
              [h.Class('block text-sm font-medium')],
              ['Titration Phases ', h.span([h.Class('text-destructive')], ['*'])]
            ),
            h.button(
              [h.Class(button({ size: 'sm', variant: 'outline' })), h.Type('button'), h.OnClick(AddedSchedulePhase())],
              ['Add Phase']
            ),
          ]
        ),
        h.p(
          [h.Class('text-xs text-muted-foreground mb-3')],
          ['Define each phase of your titration schedule. Duration is in days (28 = ~1 month).']
        ),
        h.div(
          [h.Class('space-y-3')],
          Arr.map(form.phases, (phase, index) =>
            h.keyed('div')(
              String(phase.order),
              [h.Class('flex flex-col gap-3 p-3 bg-muted/50 rounded-lg sm:flex-row sm:items-center')],
              [
                h.span([h.Class('text-sm font-medium text-muted-foreground w-16')], [`Phase ${index + 1}`]),
                h.div(
                  [h.Class('flex-1')],
                  [
                    h.input([
                      h.Class(input()),
                      h.Type('number'),
                      h.List('schedule-dose-mg-suggestions'),
                      h.Min('0'),
                      h.Step('any'),
                      h.Placeholder('Dose in mg (e.g., 2.5)'),
                      h.Value(phase.doseMg),
                      h.OnInput((value) => ChangedSchedulePhaseDoseMg({ index, value })),
                    ]),
                  ]
                ),
                h.div(
                  [h.Class('w-full sm:w-24')],
                  [
                    h.input([
                      h.Class(input()),
                      h.Type('number'),
                      h.Placeholder('Days'),
                      h.Min('1'),
                      h.Disabled(phase.isIndefinite),
                      h.Value(phase.durationDays),
                      h.OnInput((value) => ChangedSchedulePhaseDuration({ index, value })),
                    ]),
                  ]
                ),
                index === form.phases.length - 1
                  ? h.label(
                      [
                        h.Class(
                          'flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer whitespace-nowrap'
                        ),
                        h.Title('Mark as ongoing maintenance phase with no end date'),
                      ],
                      [
                        h.input([
                          h.Class('rounded border-muted-foreground/50'),
                          h.Type('checkbox'),
                          h.Checked(phase.isIndefinite),
                          h.OnClick(ToggledSchedulePhaseIndefinite({ checked: !phase.isIndefinite, index })),
                        ]),
                        'Indefinite',
                      ]
                    )
                  : h.empty,
                form.phases.length > 1
                  ? h.button(
                      [
                        h.Class(
                          button({
                            class: 'h-8 w-8 text-destructive hover:text-destructive',
                            size: 'icon',
                            variant: 'ghost',
                          })
                        ),
                        h.Type('button'),
                        h.OnClick(RemovedSchedulePhase({ index })),
                      ],
                      ['Del']
                    )
                  : h.empty,
              ]
            )
          )
        ),
      ]
    )

  const viewForm = (form: ScheduleForm) => {
    const submitLabel = scheduleSubmitLabel(form)

    const doseMgSuggestions = Arr.map(
      Schema.is(MedicationCompound)(form.drug) ? suggestedDoseMgForCompound(form.drug) : [],
      String
    )

    const isValid =
      Str.trim(form.name) !== '' &&
      Str.trim(form.drug) !== '' &&
      form.startDate !== '' &&
      Arr.every(
        form.phases,
        (phase) => Str.trim(phase.doseMg) !== '' && (phase.isIndefinite || Str.trim(phase.durationDays) !== '')
      )

    return h.div(
      [h.Class(card({ class: 'mb-6 p-6' }))],
      [
        h.form(
          [h.OnSubmit(SubmittedScheduleForm())],
          [
            h.div(
              [h.Class('mb-4')],
              [
                h.label(
                  [h.For('schedule-name'), h.Class('mb-2 block text-sm font-medium')],
                  ['Schedule Name ', h.span([h.Class('text-destructive')], ['*'])]
                ),
                h.input([
                  h.Class(input()),
                  h.Type('text'),
                  h.Id('schedule-name'),
                  h.Placeholder('e.g., Semaglutide Titration'),
                  h.Value(form.name),
                  h.OnInput((value) => ChangedScheduleName({ value })),
                ]),
              ]
            ),
            h.div(
              [h.Class('mb-4')],
              [
                h.label(
                  [h.For('schedule-drug'), h.Class('mb-2 block text-sm font-medium')],
                  ['Medication ', h.span([h.Class('text-destructive')], ['*'])]
                ),
                h.select(
                  [
                    h.Class(select()),
                    h.Id('schedule-drug'),
                    h.Value(form.drug),
                    h.OnChange((value) => ChangedScheduleDrug({ value })),
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
                h.label([h.For('schedule-supplier'), h.Class('mb-2 block text-sm font-medium')], ['Supplier']),
                h.input([
                  h.Class(input()),
                  h.Type('text'),
                  h.Id('schedule-supplier'),
                  h.Placeholder('e.g., CVS, clinic, direct vendor'),
                  h.Value(form.supplier),
                  h.OnInput((value) => ChangedScheduleSupplier({ value })),
                ]),
              ]
            ),
            h.div(
              [h.Class('grid grid-cols-1 gap-4 mb-4 sm:grid-cols-2')],
              [
                h.div(
                  [],
                  [
                    h.label(
                      [h.For('schedule-frequency'), h.Class('mb-2 block text-sm font-medium')],
                      ['Frequency ', h.span([h.Class('text-destructive')], ['*'])]
                    ),
                    h.select(
                      [
                        h.Class(select()),
                        h.Id('schedule-frequency'),
                        h.Value(form.frequency),
                        h.OnChange((value) => ChangedScheduleFrequency({ value: frequencyFromString(value) })),
                      ],
                      Arr.map(FREQUENCIES, ([value, label]) => h.keyed('option')(value, [h.Value(value)], [label]))
                    ),
                  ]
                ),
                h.div(
                  [],
                  [
                    h.label(
                      [h.For('schedule-start-date'), h.Class('mb-2 block text-sm font-medium')],
                      ['Start Date ', h.span([h.Class('text-destructive')], ['*'])]
                    ),
                    h.input([
                      h.Class(input()),
                      h.Type('date'),
                      h.Id('schedule-start-date'),
                      h.Value(form.startDate),
                      h.OnInput((value) => ChangedScheduleStartDate({ value })),
                    ]),
                  ]
                ),
              ]
            ),
            viewPhaseEditor(form),
            viewDatalist({ h, id: 'schedule-dose-mg-suggestions', values: doseMgSuggestions }),
            h.div(
              [h.Class('mb-4')],
              [
                h.label([h.For('schedule-notes'), h.Class('mb-2 block text-sm font-medium')], ['Notes']),
                h.textarea([
                  h.Class(input({ class: 'h-auto' })),
                  h.Id('schedule-notes'),
                  h.Rows(2),
                  h.Placeholder('Any additional instructions or notes...'),
                  h.Value(form.notes),
                  h.OnInput((value) => ChangedScheduleNotes({ value })),
                ]),
              ]
            ),
            form.error === null ? h.empty : h.p([h.Class('mb-3 text-sm text-destructive')], [form.error]),
            h.div(
              [h.Class('flex justify-end gap-3')],
              [
                h.button(
                  [h.Class(button({ variant: 'outline' })), h.Type('button'), h.OnClick(ClickedCancelScheduleForm())],
                  ['Cancel']
                ),
                h.button([h.Class(button()), h.Type('submit'), h.Disabled(form.submitting || !isValid)], [submitLabel]),
              ]
            ),
          ]
        ),
      ]
    )
  }

  return viewForm
}

export const viewScheduleForm = <ParentMessage>({
  form,
  h,
}: {
  readonly form: ScheduleForm
  readonly h: HtmlBuilder<ParentMessage | ScheduleMessage>
}): Html => makeViewScheduleForm(h)(form)
