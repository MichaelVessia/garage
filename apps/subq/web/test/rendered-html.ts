import { assert } from '@effect/vitest'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type { Scene } from 'foldkit'

type RenderedHtml = Scene.SceneSimulation<unknown, unknown>['html']

const encodeJson = Schema.encodeOption(Schema.fromJsonString(Schema.Unknown))

/** Serializes a rendered Foldkit HTML tree so tests can search its text and attributes. */
export const renderedHtml = (html: RenderedHtml): string =>
  Option.getOrElse(encodeJson(html), () => assert.fail('rendered HTML is not JSON'))
