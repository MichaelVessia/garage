import * as Schema from 'effect/Schema'

export const TRACK_MIN = 1
export const TRACK_MAX = 18
export const HAND_LIMIT = 5
export const ROUNDS_TO_WIN = 3
export const MAX_RESHUFFLES = 2

export const CardValue = Schema.Literals([1, 2, 3, 4, 5])
export type CardValue = typeof CardValue.Type

export const Seat = Schema.Literals([0, 1])
export type Seat = typeof Seat.Type

export const TrackSpace = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(TRACK_MIN),
  Schema.isLessThanOrEqualTo(TRACK_MAX)
)
export type TrackSpace = typeof TrackSpace.Type

export const MoveDirection = Schema.Literals(['forward', 'backward'])
export type MoveDirection = typeof MoveDirection.Type

const SeatOption = Seat.pipe(Schema.Option, Schema.toCodecJson)
const Score = Schema.Tuple([Schema.Int, Schema.Int])
const Positions = Schema.Tuple([TrackSpace, TrackSpace])
const Cards = Schema.Array(CardValue)
const RoundEndReason = Schema.Literals(['hit', 'time-over-position', 'time-over-draw'])

export const DuelPhase = Schema.TaggedUnion({
  AwaitAction: { active: Seat },
  AwaitDefense: {
    attacker: Seat,
    defender: Seat,
    strikeValue: CardValue,
    strikeCount: Schema.Int,
    isDashing: Schema.Boolean,
  },
  RoundOver: { winner: SeatOption, reason: RoundEndReason, nextStarter: Seat },
  MatchOver: { winner: Seat, finalScore: Score },
})
export type DuelPhase = typeof DuelPhase.Type

export const DuelCommand = Schema.TaggedUnion({
  Move: { card: CardValue, direction: MoveDirection },
  Push: { card: CardValue },
  Strike: { card: CardValue, count: Schema.Int },
  DashingStrike: { dashCard: CardValue, strikeCard: CardValue, strikeCount: Schema.Int },
  Block: {},
  Retreat: { card: CardValue },
  TakeHit: {},
  StartNextRound: {},
  Rematch: {},
})
export type DuelCommand = typeof DuelCommand.Type

const Movement = { seat: Seat, card: CardValue, from: TrackSpace, to: TrackSpace }

export const DuelEvent = Schema.TaggedUnion({
  RoundStarted: { round: Schema.Int, starter: Seat },
  Moved: Movement,
  Pushed: { ...Movement, opponent: Seat },
  Dashed: Movement,
  Struck: {
    attacker: Seat,
    defender: Seat,
    strikeValue: CardValue,
    strikeCount: Schema.Int,
    isDashing: Schema.Boolean,
  },
  Blocked: { defender: Seat, strikeValue: CardValue, strikeCount: Schema.Int },
  Retreated: Movement,
  Recovered: { seat: Seat },
  HitLanded: { attacker: Seat, defender: Seat },
  DeckReshuffled: { reshufflesRemaining: Schema.Int },
  RoundEnded: { winner: SeatOption, reason: RoundEndReason, score: Score },
  MatchEnded: { winner: Seat, finalScore: Score },
})
export type DuelEvent = typeof DuelEvent.Type

const PublicDuel = {
  round: Schema.Int,
  score: Score,
  positions: Positions,
  reshufflesRemaining: Schema.Int,
  phase: DuelPhase,
  turnNumber: Schema.Int,
  lastEvents: Schema.Array(DuelEvent),
}

export const DuelState = Schema.Struct({
  ...PublicDuel,
  seed: Schema.Finite,
  rngState: Schema.Int,
  hands: Schema.Tuple([Cards, Cards]),
  deck: Cards,
  discard: Cards,
})
export type DuelState = typeof DuelState.Type

export const PlayerView = Schema.Struct({
  ...PublicDuel,
  viewer: SeatOption,
  deckCount: Schema.Int,
  discard: Cards,
  myHand: Cards,
  opponentHandCount: Schema.Int,
  legalCommands: Schema.Array(DuelCommand),
})
export type PlayerView = typeof PlayerView.Type

export const ClientMessage = Schema.TaggedUnion({
  Command: { command: DuelCommand },
  SetName: { name: Schema.String },
  Ping: {},
})
export type ClientMessage = typeof ClientMessage.Type

export const MatchMode = Schema.Literals(['casual', 'ranked'])
export type MatchMode = typeof MatchMode.Type

export const ForfeitReason = Schema.Literals(['timeout', 'disconnect'])
export type ForfeitReason = typeof ForfeitReason.Type

export const RatingDelta = Schema.Struct({ before: Schema.Int, after: Schema.Int, delta: Schema.Int })
export type RatingDelta = typeof RatingDelta.Type

export const PlayerProfile = Schema.Struct({
  playerId: Schema.String,
  callsign: Schema.String,
  rating: Schema.Int,
  peakRating: Schema.Int,
  wins: Schema.Int,
  losses: Schema.Int,
  streak: Schema.Int,
})
export type PlayerProfile = typeof PlayerProfile.Type

export const DeviceLinkResponse = Schema.Struct({ code: Schema.String, expiresAtMs: Schema.Finite })
export type DeviceLinkResponse = typeof DeviceLinkResponse.Type

export const DeviceLinkRequest = Schema.Struct({ code: Schema.String })
export type DeviceLinkRequest = typeof DeviceLinkRequest.Type

export const DeviceSession = Schema.Struct({ token: Schema.String, profile: PlayerProfile })
export type DeviceSession = typeof DeviceSession.Type

export const LeaderboardEntry = Schema.Struct({ ...PlayerProfile.fields, rank: Schema.Int, isViewer: Schema.Boolean })
export type LeaderboardEntry = typeof LeaderboardEntry.Type

export const LeaderboardResponse = Schema.Struct({
  entries: Schema.Array(LeaderboardEntry),
  viewer: Schema.NullOr(LeaderboardEntry),
  totalPlayers: Schema.Int,
})
export type LeaderboardResponse = typeof LeaderboardResponse.Type

export const QueueClientMessage = Schema.TaggedUnion({ Ping: {}, Cancel: {} })
export type QueueClientMessage = typeof QueueClientMessage.Type

export const QueueServerMessage = Schema.TaggedUnion({
  Queued: { position: Schema.Int, waitingCount: Schema.Int, rating: Schema.Int, window: Schema.NullOr(Schema.Int) },
  Matched: {
    roomId: Schema.String,
    seat: Seat,
    token: Schema.String,
    opponentName: Schema.String,
    opponentRating: Schema.Int,
  },
  Cancelled: {},
  ErrorNotice: { message: Schema.String },
  Pong: {},
})
export type QueueServerMessage = typeof QueueServerMessage.Type

export const ServerMessage = Schema.TaggedUnion({
  RoomSnapshot: {
    roomId: Schema.String,
    status: Schema.Literals(['waiting', 'playing', 'finished']),
    seat: SeatOption,
    seatNames: Schema.Tuple([Schema.String, Schema.String]),
    connected: Schema.Tuple([Schema.Boolean, Schema.Boolean]),
    view: PlayerView,
    seq: Schema.Int,
    mode: Schema.optionalKey(MatchMode),
    seatRatings: Schema.optionalKey(Schema.Tuple([Schema.NullOr(Schema.Int), Schema.NullOr(Schema.Int)])),
    ratingDeltas: Schema.optionalKey(Schema.Tuple([RatingDelta, RatingDelta])),
    turnDeadlineMs: Schema.Finite.pipe(Schema.NullOr, Schema.optionalKey),
    forfeitReason: Schema.optionalKey(ForfeitReason),
  },
  ErrorNotice: { message: Schema.String },
  Pong: {},
})
export type ServerMessage = typeof ServerMessage.Type
