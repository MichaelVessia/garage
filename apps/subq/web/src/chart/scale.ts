import { ticks, utcTicks } from 'd3'

const positionInRange =
  ({ min, max, from, to }: { min: number; max: number; from: number; to: number }) =>
  (value: number): number => {
    const fraction = min === max ? 0.5 : (value - min) / (max - min)
    return from * (1 - fraction) + to * fraction
  }

export const linearScale = ({ min, max, height }: { min: number; max: number; height: number }) => ({
  position: positionInRange({ min, max, from: height, to: 0 }),
  ticks: (count: number) => ticks(min, max, count),
})

export const utcScale = ({ start, end, width }: { start: Date; end: Date; width: number }) => {
  const position = positionInRange({ min: start.getTime(), max: end.getTime(), from: 0, to: width })
  return {
    start,
    end,
    position: (date: Date) => position(date.getTime()),
    ticks: (count: number) => utcTicks(start, end, count),
  }
}
