import { neighbor } from '../src/index.ts'
import type { Command } from '../src/index.ts'

// Each path starts with a machine. The letters give its output direction and
// each following belt direction. All coordinates use seed zero.
type Path = readonly [x: number, y: number, machine: 'extractor' | 'add' | 'mul' | 'beacon', directions: string]
const layouts = {
  one: [[13, 12, 'extractor', 'SEEEE']],
  three: [
    [18, 14, 'add', 'N'],
    [13, 12, 'extractor', 'SSEEEEE'],
    [21, 13, 'extractor', 'WWSW'],
  ],
  seven: [
    [18, 11, 'add', 'S'],
    [17, 6, 'extractor', 'SSSSEESW'],
    [10, 13, 'extractor', 'EEEEEENNEE'],
  ],
  twelve: [
    [16, 14, 'add', 'EN'],
    [16, 11, 'add', 'SSS'],
    [17, 6, 'extractor', 'SSSSSW'],
    [16, 6, 'extractor', 'SSSSWSE'],
    [16, 16, 'add', 'NN'],
    [10, 14, 'extractor', 'SSEEEEEE'],
    [21, 13, 'extractor', 'WWSWSWSW'],
  ],
  // Prime Rush: 4 + 4 + 3.
  eleven: [
    [17, 14, 'add', 'N'],
    [16, 15, 'add', 'NE'],
    [10, 14, 'extractor', 'EEEEESE'],
    [10, 13, 'extractor', 'WSSSEEEEEEEENW'],
    [17, 6, 'extractor', 'EESSSSSSSSWW'],
  ],
  twentyFour: [
    [15, 13, 'mul', 'EE'],
    [7, 20, 'extractor', 'EEEEEEENNNNNNNNES'],
    [10, 13, 'extractor', 'EEENNEEEEEESSSWWWWN'],
  ],
  // Prime Rush: 3 × 4 + 7.
  nineteen: [
    [17, 15, 'add', 'NN'],
    [15, 15, 'mul', 'EE'],
    [16, 6, 'extractor', 'SSSSSSSSWS'],
    [10, 14, 'extractor', 'SSEEEEEN'],
    [28, 14, 'extractor', 'SWWWWWWWWWWW'],
  ],
  thirtySeven: [
    [20, 13, 'add', 'WW'],
    [21, 14, 'mul', 'WN'],
    [7, 20, 'extractor', 'EEEEEEEEEEEEEENNNNNN'],
    [7, 21, 'extractor', 'EEEEEEEEEEEEEEENNNNNNNNWS'],
    [13, 12, 'extractor', 'EEENEEEESS'],
  ],
  // Prime Rush: 4 × 7 + 1.
  twentyNine: [
    [19, 12, 'add', 'W'],
    [19, 15, 'mul', 'NNN'],
    [10, 14, 'extractor', 'EEEEEEEESE'],
    [28, 14, 'extractor', 'SWWWWWWWWW'],
    [13, 12, 'extractor', 'NEEEEEES'],
  ],
  fortyEight: [
    [17, 16, 'mul', 'NNN'],
    [7, 20, 'extractor', 'EEEEEEEEENNNNE'],
    [11, 24, 'extractor', 'NNNEEEEEENNNNENW'],
    [15, 12, 'mul', 'EE'],
    [16, 6, 'extractor', 'WSSSSSS'],
    [10, 13, 'extractor', 'EEEEEN'],
  ],
  // Prime Rush: 5 × 8 + 1.
  fortyOne: [
    [19, 14, 'add', 'WN'],
    [21, 15, 'mul', 'WWN'],
    [19, 20, 'extractor', 'EENNNNN'],
    [11, 24, 'extractor', 'NNNEEEEEEEEEEENNNNNNNWS'],
    [13, 12, 'extractor', 'NEEEEEESSS'],
    [15, 13, 'mul', 'ENE'],
    [16, 6, 'extractor', 'WWWWSSSSSSSEENES'],
    [10, 14, 'extractor', 'EEEEEN'],
  ],
  seventyTwo: [
    [20, 12, 'mul', 'WW'],
    [11, 24, 'extractor', 'EEEEEEEEENNNNNNNNNNNN'],
    [24, 23, 'extractor', 'WWWNNNNNNNNNNNNWS'],
    [18, 10, 'mul', 'SS'],
    [10, 13, 'extractor', 'NNNNEEEEEEEEESW'],
    [7, 20, 'extractor', 'EEEEEEEEENNNNNNNNNENE'],
    [11, 25, 'beacon', 'N'],
    [10, 14, 'extractor', 'WWWWSSSSSSSEEEESSSSE'],
  ],
  // Prime Rush: 6 × 9 + 5.
  fiftyNine: [
    [16, 14, 'add', 'NE'],
    [14, 15, 'mul', 'ENE'],
    [7, 20, 'extractor', 'EEEEEENNNNNNES'],
    [24, 23, 'extractor', 'NNNNNNNWWWWWWWWWWN'],
    [17, 1, 'extractor', 'EESSSSSSSSSSSSSWWW'],
    [17, 10, 'mul', 'ESS'],
    [17, 6, 'extractor', 'SSSS'],
    [9, 24, 'extractor', 'NNNWWWNNNNNNNNNNEEEEEEEEEEEN'],
    [23, 23, 'beacon', 'N'],
    [30, 6, 'extractor', 'WWWWWSSSSSSSSSSSSSSSSSSWWN'],
  ],
  ninetySix: [
    [14, 13, 'mul', 'EEE'],
    [7, 20, 'extractor', 'NNNNNNNNEEEEEEES'],
    [12, 15, 'add', 'NEEN'],
    [28, 14, 'extractor', 'SSWWWWWWWWWWWWWWWWWNE'],
    [25, 23, 'extractor', 'NNNNNNEEEENNNNWWSSWWWWWWWWWWWWWWW'],
    [19, 10, 'add', 'WSS'],
    [21, 13, 'extractor', 'WWNNN'],
    [18, 6, 'mul', 'ESSSS'],
    [17, 1, 'extractor', 'ESSSSS'],
    [28, 12, 'extractor', 'NNNNNNNNNNNNWWWWWWWWWWWWSSESSSSSEN'],
    [21, 12, 'beacon', 'N'],
    [24, 10, 'extractor', 'WWWSS'],
  ],
  // Prime Rush: 9 × 9 + 2.
  eightyThree: [
    [20, 11, 'add', 'WWWS'],
    [21, 13, 'extractor', 'WNN'],
    [19, 8, 'mul', 'SSES'],
    [24, 23, 'extractor', 'NNNNNNNNNNNNNNNWWWWW'],
    [25, 23, 'extractor', 'NNNNNNNNNNNNNNNNWWWWWWWSE'],
    [14, 12, 'add', 'EEE'],
    [13, 12, 'extractor', 'NES'],
    [15, 14, 'mul', 'NWN'],
    [7, 20, 'extractor', 'NNNNNNEEEEEEEE'],
    [7, 21, 'extractor', 'ENNNNNNEEEEEEEENW'],
    [21, 14, 'beacon', 'N'],
    [10, 13, 'extractor', 'WWWWSSSSSSSSSEEEEEEEEEEEEEEENNNNNNNN'],
  ],
  oneTwentyEight: [
    [16, 14, 'mul', 'NNE'],
    [15, 16, 'mul', 'NNE'],
    [10, 14, 'extractor', 'EEEESSE'],
    [10, 13, 'extractor', 'WSSEEEESSEEENW'],
    [11, 24, 'extractor', 'EEEEEENNNNNNNNNNW'],
    [20, 11, 'mul', 'WWWS'],
    [10, 24, 'extractor', 'SEEEEEEEEEENNNNNNNNNNNNNN'],
    [7, 20, 'extractor', 'NNNNNNNNNNEEEEEEEEEEEEES'],
    [10, 23, 'beacon', 'N'],
    [28, 12, 'extractor', 'WWWWWWWNNNWWWWWWWWWWWWWWWSSSSSSSSSSSSEEEESS'],
  ],
  elevenAgain: [
    [16, 11, 'add', 'EES'],
    [16, 1, 'extractor', 'SSSSSSSSSS'],
    [7, 20, 'extractor', 'EEEEEEEEENNNNNNNNN'],
    [20, 13, 'mul', 'WW'],
    [7, 21, 'extractor', 'EEEEEEEEEEEEENNNNNNNN'],
    [11, 24, 'extractor', 'EEEEEEEEEENNNNNNNNNNNNWS'],
    [6, 20, 'beacon', 'N'],
    [28, 14, 'extractor', 'SSSSSSSSSSSWWWWWWWWWWWWWWWWWWNNNWWWWNN'],
  ],
  oneFortyFour: [
    [18, 15, 'mul', 'NWN'],
    [15, 14, 'mul', 'ESEE'],
    [10, 13, 'extractor', 'EEEEES'],
    [10, 14, 'extractor', 'SEEEEEN'],
    [24, 23, 'extractor', 'WWWWWNNNNNNNNW'],
    [21, 13, 'mul', 'WWW'],
    [25, 23, 'extractor', 'NNNNNNNNNWWWWN'],
    [9, 24, 'extractor', 'NNNNNNNNNNNNNEEEEEEEEEESEES'],
    [10, 24, 'beacon', 'N'],
    [28, 14, 'extractor', 'SSSSSSSSSSWWWWWWWWWWWWWWWWWW'],
  ],
  nineteenAgain: [
    [19, 11, 'add', 'SSW'],
    [28, 12, 'extractor', 'NWWWWWWWWW'],
    [16, 11, 'mul', 'EEE'],
    [16, 6, 'extractor', 'SSSSS'],
    [10, 13, 'extractor', 'EEEEEENN'],
    [16, 16, 'mul', 'NNEN'],
    [11, 24, 'extractor', 'EEEENNNNNNNNE'],
    [24, 23, 'extractor', 'NNNNNNNWWWWWWWW'],
    [28, 13, 'beacon', 'N'],
    [21, 13, 'extractor', 'EEEEEEE'],
  ],
} satisfies Record<string, ReadonlyArray<Path>>

export function layout(name: keyof typeof layouts): Array<Command> {
  const commands: Array<Command> = [{ type: 'clearFloor' }]
  for (const [gx, gy, machine, directions] of layouts[name]) {
    let cell = { gx, gy }
    for (const [index, dir] of Array.from(directions).entries()) {
      if (dir !== 'N' && dir !== 'E' && dir !== 'S' && dir !== 'W') {
        throw new Error('Invalid belt direction')
      }
      const kind = index === 0 ? machine : 'belt'
      commands.push(
        kind === 'add' || kind === 'mul'
          ? { type: 'placeBuilding', kind: 'combiner', op: kind, ...cell, dir }
          : { type: 'placeBuilding', kind, ...cell, dir }
      )
      cell = neighbor(dir)(cell)
    }
  }
  return commands
}
