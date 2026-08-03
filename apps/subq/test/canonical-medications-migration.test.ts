import { Database } from 'bun:sqlite'

import { assert, describe, it } from '@effect/vitest'
import * as Schema from 'effect/Schema'

const migrationSql = await Bun.file(new URL('../drizzle/0013_canonical_medications.sql', import.meta.url)).text()

const ScheduleRows = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    drug: Schema.String,
    supplier: Schema.NullOr(Schema.String),
  })
)
const InjectionRows = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    drug: Schema.String,
    supplier: Schema.NullOr(Schema.String),
    dose_mg: Schema.Number,
    schedule_id: Schema.NullOr(Schema.String),
  })
)
const PhaseRows = Schema.Array(Schema.Struct({ id: Schema.String, dose_mg: Schema.Number }))
const TableInfoRows = Schema.Array(Schema.Struct({ name: Schema.String }))

const makeLegacyDatabase = (): Database => {
  const database = new Database(':memory:')
  database.run('PRAGMA foreign_keys = ON')
  database.run(`
    CREATE TABLE injection_schedules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      drug TEXT NOT NULL,
      source TEXT,
      frequency TEXT NOT NULL,
      start_date TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE schedule_phases (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL REFERENCES injection_schedules(id) ON DELETE CASCADE,
      "order" INTEGER NOT NULL,
      duration_days INTEGER,
      dosage TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE injection_logs (
      id TEXT PRIMARY KEY,
      datetime TEXT NOT NULL,
      drug TEXT NOT NULL,
      source TEXT,
      dosage TEXT NOT NULL,
      injection_site TEXT,
      notes TEXT,
      schedule_id TEXT REFERENCES injection_schedules(id) ON DELETE SET NULL,
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)
  return database
}

const applyMigration = (database: Database): void => {
  for (const statement of migrationSql.split('--> statement-breakpoint')) {
    if (statement.trim() !== '') {
      database.run(statement)
    }
  }
}

const insertLegacySchedule = (database: Database, id: string, drug: string, source: string | null = null): void => {
  database
    .query(
      `INSERT INTO injection_schedules
       (id, name, drug, source, frequency, start_date, is_active, notes, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'weekly', '2026-01-01T00:00:00.000Z', 1, NULL, 'user-1',
               '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
    )
    .run(id, `Schedule ${id}`, drug, source)
}

const insertLegacyInjection = (
  database: Database,
  id: string,
  drug: string,
  dosage: string,
  source: string | null = null,
  scheduleId: string | null = null
): void => {
  database
    .query(
      `INSERT INTO injection_logs
       (id, datetime, drug, source, dosage, injection_site, notes, schedule_id, user_id, created_at, updated_at)
       VALUES (?, '2026-01-01T12:00:00.000Z', ?, ?, ?, NULL, NULL, ?, 'user-1',
               '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
    )
    .run(id, drug, source, dosage, scheduleId)
}

describe('canonical medication migration', () => {
  it('normalizes every recognized current label and clear case-insensitive mg string', () => {
    const database = makeLegacyDatabase()
    const labels: ReadonlyArray<readonly [string, string]> = [
      ['Semaglutide', 'Semaglutide'],
      [' semaglutide (Ozempic) ', 'Semaglutide'],
      ['Semaglutide (Wegovy)', 'Semaglutide'],
      ['SEMAGLUTIDE (COMPOUNDED)', 'Semaglutide'],
      ['Tirzepatide', 'Tirzepatide'],
      ['Tirzepatide (Mounjaro)', 'Tirzepatide'],
      ['Tirzepatide (Zepbound)', 'Tirzepatide'],
      ['TIRZEPATIDE (COMPOUNDED)', 'Tirzepatide'],
      ['Retatrutide (Compounded)', 'Retatrutide'],
      ['Liraglutide (Saxenda)', 'Liraglutide'],
      ['Dulaglutide (Trulicity)', 'Dulaglutide'],
    ]

    for (const [index, [legacy, canonical]] of labels.entries()) {
      insertLegacySchedule(database, `schedule-${index}`, legacy, index === 0 ? 'Clinic' : null)
      insertLegacyInjection(database, `injection-${index}`, legacy, index % 2 === 0 ? '0.25 mg' : '5 MG')
      assert.isNotEmpty(canonical)
    }
    database
      .query(
        `INSERT INTO schedule_phases
         (id, schedule_id, "order", duration_days, dosage, created_at, updated_at)
         VALUES ('phase-1', 'schedule-0', 1, NULL, '0.25mg',
                 '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      )
      .run()
    database
      .query("UPDATE injection_logs SET source = 'Pharmacy', schedule_id = 'schedule-0' WHERE id = 'injection-0'")
      .run()

    applyMigration(database)

    const schedules = Schema.decodeUnknownSync(ScheduleRows)(
      database
        .query('SELECT id, drug, supplier FROM injection_schedules ORDER BY CAST(substr(id, 10) AS integer)')
        .all()
    )
    const injections = Schema.decodeUnknownSync(InjectionRows)(
      database
        .query(
          'SELECT id, drug, supplier, dose_mg, schedule_id FROM injection_logs ORDER BY CAST(substr(id, 11) AS integer)'
        )
        .all()
    )
    const phases = Schema.decodeUnknownSync(PhaseRows)(
      database.query('SELECT id, dose_mg FROM schedule_phases ORDER BY id').all()
    )

    assert.deepStrictEqual(
      schedules.map((row) => row.drug),
      labels.map(([, canonical]) => canonical)
    )
    assert.deepStrictEqual(
      injections.map((row) => row.drug),
      labels.map(([, canonical]) => canonical)
    )
    assert.strictEqual(schedules[0]?.supplier, 'Clinic')
    assert.strictEqual(injections[0]?.supplier, 'Pharmacy')
    assert.strictEqual(injections[0]?.schedule_id, 'schedule-0')
    assert.deepStrictEqual(phases, [{ id: 'phase-1', dose_mg: 0.25 }])
    assert.deepStrictEqual(
      injections.map((row) => row.dose_mg),
      labels.map((_, index) => (index % 2 === 0 ? 0.25 : 5))
    )
    database.close()
  })

  it('identifies an unsupported compound record and value before changing tables', () => {
    const database = makeLegacyDatabase()
    insertLegacyInjection(database, 'bad-compound', 'Ozempic', '1mg')

    assert.throws(() => {
      applyMigration(database)
    }, "Canonical medication migration rejected injection log drug record 'bad-compound' value 'Ozempic'")
    const legacyColumns = Schema.decodeUnknownSync(TableInfoRows)(
      database.query("PRAGMA table_info('injection_logs')").all()
    )
    assert.deepStrictEqual(
      legacyColumns.map((column) => column.name),
      [
        'id',
        'datetime',
        'drug',
        'source',
        'dosage',
        'injection_site',
        'notes',
        'schedule_id',
        'user_id',
        'created_at',
        'updated_at',
      ]
    )
    database.close()
  })

  it('identifies each unsupported dose record and value instead of inferring a conversion', () => {
    const unsupported = [
      '',
      '0 mg',
      '-1 mg',
      '0.5ml',
      '10 units',
      '20 IU',
      'NaN mg',
      'Infinity mg',
      `${'9'.repeat(400)} mg`,
      'unknown',
    ]

    for (const [index, value] of unsupported.entries()) {
      const database = makeLegacyDatabase()
      const id = `bad-dose-${index}`
      insertLegacyInjection(database, id, 'Semaglutide', value)

      assert.throws(() => {
        applyMigration(database)
      }, `Canonical medication migration rejected injection log dosage record '${id}' value '${value}'`)
      database.close()
    }
  })

  it('identifies an unsupported schedule phase dose with its phase id', () => {
    const database = makeLegacyDatabase()
    insertLegacySchedule(database, 'schedule-1', 'Semaglutide')
    database
      .query(
        `INSERT INTO schedule_phases
         (id, schedule_id, "order", duration_days, dosage, created_at, updated_at)
         VALUES ('bad-phase', 'schedule-1', 1, NULL, '25 units',
                 '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      )
      .run()

    assert.throws(() => {
      applyMigration(database)
    }, "Canonical medication migration rejected schedule phase dosage record 'bad-phase' value '25 units'")
    database.close()
  })
})
