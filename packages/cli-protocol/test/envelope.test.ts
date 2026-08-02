import { assert, it } from '@effect/vitest'
import { describe } from 'vitest'

import { errorEnvelope, renderEnvelope, successEnvelope } from '../src/index.js'

describe('CLI envelopes', () => {
  it('builds stable success envelopes with next actions', () => {
    const envelope = successEnvelope({
      command: 'sonarr search Linux ISO',
      result: {
        query: 'Linux ISO',
        count: 1,
        results: [
          {
            title: 'Linux ISO Weekly',
            year: 2022,
            tvdbId: 371_980,
            tvdbUrl: 'https://thetvdb.com/dereferrer/series/371980',
          },
        ],
      },
      nextActions: [
        {
          command: 'sonarr exists <tvdb-id>',
          description: 'Check whether a selected series is already in the library',
          params: {
            'tvdb-id': { value: 371_980, description: 'TVDB series ID' },
          },
        },
      ],
    })

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'sonarr search Linux ISO',
      result: {
        query: 'Linux ISO',
        count: 1,
        results: [
          {
            title: 'Linux ISO Weekly',
            year: 2022,
            tvdbId: 371_980,
            tvdbUrl: 'https://thetvdb.com/dereferrer/series/371980',
          },
        ],
      },
      next_actions: [
        {
          command: 'sonarr exists <tvdb-id>',
          description: 'Check whether a selected series is already in the library',
          params: {
            'tvdb-id': { value: 371_980, description: 'TVDB series ID' },
          },
        },
      ],
    })
    assert.strictEqual(
      renderEnvelope(envelope),
      '{"ok":true,"command":"sonarr search Linux ISO","result":{"query":"Linux ISO","count":1,"results":[{"title":"Linux ISO Weekly","year":2022,"tvdbId":371980,"tvdbUrl":"https://thetvdb.com/dereferrer/series/371980"}]},"next_actions":[{"command":"sonarr exists <tvdb-id>","description":"Check whether a selected series is already in the library","params":{"tvdb-id":{"value":371980,"description":"TVDB series ID"}}}]}'
    )
  })

  it('builds stable error envelopes with fixes', () => {
    const envelope = errorEnvelope({
      command: 'sonarr status',
      error: {
        code: 'SONARR_ENV_MISSING',
        message: 'SONARR_URL is not set',
      },
      fix: 'Open a fresh shell so sops-nix exports SONARR_URL and SONARR_API_KEY from modules/programs/shell.nix.',
      nextActions: [{ command: 'sonarr', description: 'Show available commands' }],
    })

    assert.deepStrictEqual(envelope, {
      ok: false,
      command: 'sonarr status',
      error: {
        code: 'SONARR_ENV_MISSING',
        message: 'SONARR_URL is not set',
      },
      fix: 'Open a fresh shell so sops-nix exports SONARR_URL and SONARR_API_KEY from modules/programs/shell.nix.',
      next_actions: [{ command: 'sonarr', description: 'Show available commands' }],
    })
  })
})
