import { sql } from 'drizzle-orm'
import { check, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Better Auth tables
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull(),
  image: text('image'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }),
})

// Weight log entries table
// All weights stored in lbs
export const weightLogs = sqliteTable(
  'weight_logs',
  {
    id: text('id').primaryKey(),
    datetime: text('datetime').notNull(),
    weight: real('weight').notNull(),
    notes: text('notes'),
    userId: text('user_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_weight_logs_datetime').on(table.datetime), index('idx_weight_logs_user_id').on(table.userId)]
)

// Injection schedules table
export const injectionSchedules = sqliteTable(
  'injection_schedules',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    drug: text('drug', {
      enum: ['Semaglutide', 'Tirzepatide', 'Retatrutide', 'Liraglutide', 'Dulaglutide'],
    }).notNull(),
    supplier: text('supplier'),
    frequency: text('frequency', {
      enum: ['daily', 'every_3_days', 'weekly', 'every_2_weeks', 'monthly'],
    }).notNull(),
    startDate: text('start_date').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    notes: text('notes'),
    userId: text('user_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_injection_schedules_user_id').on(table.userId),
    index('idx_injection_schedules_is_active').on(table.isActive),
    check(
      'injection_schedules_drug_supported',
      sql`${table.drug} IN ('Semaglutide', 'Tirzepatide', 'Retatrutide', 'Liraglutide', 'Dulaglutide')`
    ),
  ]
)

// Injection log entries table
export const injectionLogs = sqliteTable(
  'injection_logs',
  {
    id: text('id').primaryKey(),
    datetime: text('datetime').notNull(),
    drug: text('drug', {
      enum: ['Semaglutide', 'Tirzepatide', 'Retatrutide', 'Liraglutide', 'Dulaglutide'],
    }).notNull(),
    supplier: text('supplier'),
    doseMg: real('dose_mg').notNull(),
    injectionSite: text('injection_site'),
    notes: text('notes'),
    scheduleId: text('schedule_id').references(() => injectionSchedules.id, {
      onDelete: 'set null',
    }),
    userId: text('user_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_injection_logs_datetime').on(table.datetime),
    index('idx_injection_logs_drug').on(table.drug),
    index('idx_injection_logs_user_id').on(table.userId),
    index('idx_injection_logs_schedule_id').on(table.scheduleId),
    check(
      'injection_logs_drug_supported',
      sql`${table.drug} IN ('Semaglutide', 'Tirzepatide', 'Retatrutide', 'Liraglutide', 'Dulaglutide')`
    ),
    check(
      'injection_logs_dose_mg_positive_finite',
      sql`${table.doseMg} > 0 AND ${table.doseMg} <= 1.7976931348623157e308`
    ),
  ]
)

// Schedule phases table (for titration steps)
export const schedulePhases = sqliteTable(
  'schedule_phases',
  {
    id: text('id').primaryKey(),
    scheduleId: text('schedule_id')
      .notNull()
      .references(() => injectionSchedules.id, { onDelete: 'cascade' }),
    order: integer('order').notNull(),
    durationDays: integer('duration_days'),
    doseMg: real('dose_mg').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_schedule_phases_schedule_id').on(table.scheduleId),
    check(
      'schedule_phases_dose_mg_positive_finite',
      sql`${table.doseMg} > 0 AND ${table.doseMg} <= 1.7976931348623157e308`
    ),
  ]
)

// User goals table
export const userGoals = sqliteTable(
  'user_goals',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    goalWeight: real('goal_weight').notNull(),
    startingWeight: real('starting_weight').notNull(),
    startingDate: text('starting_date').notNull(),
    targetDate: text('target_date'),
    notes: text('notes'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_user_goals_user_id').on(table.userId), index('idx_user_goals_is_active').on(table.isActive)]
)

// User settings table
export const userSettings = sqliteTable(
  'user_settings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().unique(),
    weightUnit: text('weight_unit', { enum: ['lbs', 'kg'] })
      .notNull()
      .default('lbs'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_user_settings_user_id').on(table.userId)]
)
