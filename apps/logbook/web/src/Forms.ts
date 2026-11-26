import { AssetCategory, MeterUnit } from '@garage/logbook-domain/Values'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Record from 'effect/Record'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Editor, Message } from './Model.ts'
import type { AssetSetupEditor, Field, Model, QuickMode } from './Model.ts'

export const primaryButton =
  'min-h-10 rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50'
export const secondaryButton =
  'min-h-10 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium hover:border-teal-700 disabled:opacity-50'
const control =
  'mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 focus-visible:outline-2 focus-visible:outline-teal-700'

const change = (field: Field) => (value: string) => Message.EditedField({ field, value })

export const forms = (h: HtmlBuilder<Message>) => (model: Model) => {
  const value = (field: Field) => model.fields[field] ?? ''
  const text = (
    field: Field,
    label: string,
    options: Readonly<{ required?: boolean; numeric?: boolean; type?: 'date' | 'url' }> = {}
  ): Html =>
    h.label(
      [h.Class('block text-sm font-medium')],
      [
        label,
        h.input([
          h.Class(control),
          h.Type(options.type ?? 'text'),
          h.Value(value(field)),
          h.OnInput(change(field)),
          h.Required(options.required ?? false),
          ...(options.numeric === true ? [h.InputMode('decimal')] : []),
        ]),
      ]
    )
  const select = (field: Field, label: string, options: ReadonlyArray<readonly [string, string]>, initial = ''): Html =>
    h.div(
      [h.Class('text-sm font-medium')],
      [
        h.label([h.For(`logbook-${field}`)], [label]),
        h.select(
          [
            h.Id(`logbook-${field}`),
            h.Class(control),
            h.Value(model.fields[field] ?? initial),
            h.OnChange(change(field)),
          ],
          Arr.map(options, ([value, label]) => h.option([h.Key(value), h.Value(value)], [label]))
        ),
      ]
    )
  const notes = h.label(
    [h.Class('block text-sm font-medium')],
    ['Notes (optional)', h.textarea([h.Class(control), h.Rows(2), h.Value(value('notes')), h.OnInput(change('notes'))])]
  )
  const work = (meterEnabled: boolean): ReadonlyArray<Html> => [
    select(
      'performedBy',
      'Performed by',
      [
        ['diy', 'DIY'],
        ['shop', 'Shop'],
      ],
      'diy'
    ),
    text('cost', 'Cost in USD (optional)', { numeric: true }),
    ...(meterEnabled ? [text('reading', 'Meter reading (optional)', { numeric: true })] : []),
    text('vendor', 'Vendor (optional)'),
    notes,
  ]

  const correction = h.label(
    [h.Class('flex items-center gap-2 text-sm font-medium')],
    [
      h.input([
        h.Type('checkbox'),
        h.Class('size-4 accent-teal-800'),
        h.Checked(value('correction') === 'true'),
        h.OnClick(Message.EditedField({ field: 'correction', value: value('correction') === 'true' ? '' : 'true' })),
      ]),
      'Save as a correction',
    ]
  )

  const form = (label: string, inputs: ReadonlyArray<Html>, canCancel = false): Html => {
    const status = model.attempt?.status
    const submitLabel = status === undefined ? label : { saving: 'Saving…', unknown: 'Retry save' }[status]
    return h.form(
      [h.Class('rounded-xl border border-teal-200 bg-teal-50/50 p-4'), h.OnSubmit(Message.Submitted())],
      [
        h.fieldset(
          [h.Class('grid gap-3 sm:grid-cols-2'), h.Disabled(model.attempt !== null || model.sessionExpired)],
          inputs
        ),
        model.problem === null ? null : h.p([h.Role('alert'), h.Class('mt-3 text-sm text-red-800')], [model.problem]),
        model.correctionOffered
          ? h.fieldset([h.Class('mt-3'), h.Disabled(model.attempt !== null || model.sessionExpired)], [correction])
          : null,
        h.div(
          [h.Class('mt-4 flex flex-wrap gap-2')],
          [
            h.button(
              [
                h.Type('submit'),
                h.Class(primaryButton),
                h.Disabled(model.attempt?.status === 'saving' || model.sessionExpired),
              ],
              [submitLabel]
            ),
            canCancel
              ? h.button(
                  [
                    h.Type('button'),
                    h.Class(secondaryButton),
                    h.Disabled(model.attempt !== null),
                    h.OnClick(Message.ClosedEditor()),
                  ],
                  ['Cancel']
                )
              : null,
          ]
        ),
      ]
    )
  }

  const assetSelect = (requiresMeter: boolean): Html =>
    select('asset', 'Asset', [
      ['', 'Select an asset'],
      ...Arr.map(
        Arr.filter(
          Record.values(model.catalog?.assets ?? {}),
          (asset) => asset.status === 'active' && (!requiresMeter || asset.meter !== undefined)
        ),
        (asset): readonly [string, string] => [
          asset.id,
          asset.location === undefined ? asset.name : `${asset.name} · ${asset.location}`,
        ]
      ),
    ])
  const selectedMeter = Option.getOrUndefined(
    Arr.findFirst(Record.values(model.catalog?.assets ?? {}), (asset) => asset.id === value('asset'))
  )?.meter
  const modes = [
    ['RecordMeter', 'Update meter'],
    ['LogService', 'Log service'],
    ['RegisterAsset', 'New asset'],
  ] satisfies ReadonlyArray<readonly [typeof QuickMode.Type, string]>
  const assetMetadata = (): ReadonlyArray<Html> => [
    text('name', 'Asset name', { required: true }),
    select(
      'category',
      'Category',
      Arr.map(AssetCategory.literals, (category) => [category, category]),
      'other'
    ),
    text('make', 'Make (optional)'),
    text('model', 'Model (optional)'),
    text('serialNumber', 'Serial number (optional)'),
    text('purchasedOn', 'Purchase date (optional, YYYY-MM-DD)'),
    text('purchasePrice', 'Purchase price in USD (optional)', { numeric: true }),
    text('location', 'Location (optional)'),
    notes,
  ]

  const quick = (): Html => {
    const content = Editor.guards.RegisterAsset(model.editor)
      ? form('Register asset', [
          ...assetMetadata(),
          select('unit', 'Meter unit (optional)', [
            ['', 'No meter'],
            ...Arr.map(MeterUnit.literals, (unit): readonly [string, string] => [unit, unit]),
          ]),
          text('reading', 'Initial meter reading (optional)', { numeric: true }),
        ])
      : Editor.guards.LogService(model.editor)
        ? form('Save service', [
            assetSelect(false),
            text('title', 'Service title', { required: true }),
            ...work(selectedMeter !== undefined),
          ])
        : form('Save reading', [
            assetSelect(true),
            text('reading', selectedMeter === undefined ? 'Meter reading' : `Meter reading (${selectedMeter.unit})`, {
              required: true,
              numeric: true,
            }),
          ])
    return h.section(
      [h.Class('space-y-4')],
      [
        h.h2([h.Class('text-2xl font-semibold')], ['Quick Log']),
        h.div(
          [h.Class('flex flex-wrap gap-2')],
          Arr.map(modes, ([mode, label]) =>
            h.button(
              [
                h.Type('button'),
                h.Class(secondaryButton),
                h.AriaPressed(Editor.guards[mode](model.editor) ? 'true' : 'false'),
                h.Disabled(model.attempt !== null),
                h.OnClick(Message.ChoseQuickMode({ mode })),
              ],
              [label]
            )
          )
        ),
        content,
      ]
    )
  }

  const assetSetup = (editor: AssetSetupEditor): Html => {
    switch (editor.mode) {
      case 'AddSchedule': {
        const cadence = value('cadence') || 'IntervalDays'
        const unit = editor.meterUnit
        const meterOptions: ReadonlyArray<readonly [string, string]> =
          unit === undefined
            ? []
            : [
                ['MeterInterval', `Every set number of ${unit}`],
                ['Either', `Days or ${unit}, whichever comes first`],
              ]
        return form(
          'Save schedule',
          [
            text('title', 'Schedule title', { required: true }),
            select(
              'cadence',
              'Cadence',
              [['IntervalDays', 'Every set number of days'], ...meterOptions, ['Seasonal', 'Annual date']],
              'IntervalDays'
            ),
            ...(cadence === 'IntervalDays' || cadence === 'Either'
              ? [text('days', 'Interval in days', { required: true, numeric: true })]
              : []),
            ...(unit !== undefined && (cadence === 'MeterInterval' || cadence === 'Either')
              ? [
                  text('every', `Interval in ${unit}`, { required: true, numeric: true }),
                  text('lastCompletedMeter', `Meter at last completion in ${unit} (optional)`, { numeric: true }),
                ]
              : []),
            ...(cadence === 'Seasonal'
              ? [
                  text('month', 'Month (1 to 12)', { required: true, numeric: true }),
                  text('day', 'Day of month (1 to 31)', { required: true, numeric: true }),
                ]
              : []),
            ...(cadence === 'MeterInterval'
              ? []
              : [text('lastCompletedOn', 'Last completion date (optional)', { type: 'date' })]),
            text('cost', 'Estimated cost in USD (optional)', { numeric: true }),
            notes,
          ],
          true
        )
      }
      case 'RecordWarranty':
        return form(
          'Save warranty',
          [
            text('label', 'Warranty name', { required: true }),
            text('expiresOn', 'Expiration date', { required: true, type: 'date' }),
            text('coverage', 'Coverage (optional)'),
            text('url', 'Warranty URL (optional)', { type: 'url' }),
            notes,
          ],
          true
        )
      case 'SetSpec':
        return form(
          'Save spec',
          [
            text('key', 'Specification name', { required: true }),
            text('value', 'Specification value', { required: true }),
            text('url', 'Reorder URL (optional)', { type: 'url' }),
          ],
          true
        )
      case 'AttachLink':
        return form(
          'Save link',
          [text('label', 'Link name', { required: true }), text('url', 'Link URL', { required: true, type: 'url' })],
          true
        )
    }
  }

  return {
    quick,
    completion: (meterEnabled: boolean) => form('Save completion', work(meterEnabled), true),
    assetSetup,
    assetEdit: () => form('Save asset', assetMetadata(), true),
  }
}
