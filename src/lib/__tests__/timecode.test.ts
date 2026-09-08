import { describe, expect, it } from 'vitest'
import {
  isTimecodePairValid,
  parseTimecodeToSeconds,
  secondsToTimecode,
} from '@/lib/timecode'
import { clockLabel } from '@/lib/globalExportModel'

describe('parseTimecodeToSeconds', () => {
  it('convertit MM:SS en secondes entières', () => {
    expect(parseTimecodeToSeconds('01:05')).toBe(65)
    expect(parseTimecodeToSeconds('1:05')).toBe(65)
    expect(parseTimecodeToSeconds('00:00')).toBe(0)
    expect(parseTimecodeToSeconds('02:30')).toBe(150)
  })

  it('autorise les minutes au-delà de 59 (MM:SS non borné)', () => {
    expect(parseTimecodeToSeconds('62:05')).toBe(3725)
    expect(parseTimecodeToSeconds('99:59')).toBe(5999)
  })

  it('convertit HH:MM:SS en secondes', () => {
    expect(parseTimecodeToSeconds('1:00:01')).toBe(3601)
    expect(parseTimecodeToSeconds('00:02:30')).toBe(150)
  })

  it('rejette les secondes > 59 et les minutes médianes > 59', () => {
    expect(parseTimecodeToSeconds('00:60')).toBeNull()
    expect(parseTimecodeToSeconds('0:75')).toBeNull()
    expect(parseTimecodeToSeconds('1:62:05')).toBeNull()
  })

  it('accepte les secondes brutes positives', () => {
    expect(parseTimecodeToSeconds('123')).toBe(123)
    expect(parseTimecodeToSeconds('45')).toBe(45)
  })

  it('rejette les entrées invalides', () => {
    expect(parseTimecodeToSeconds('')).toBeNull()
    expect(parseTimecodeToSeconds('   ')).toBeNull()
    expect(parseTimecodeToSeconds('-5')).toBeNull()
    expect(parseTimecodeToSeconds('abc')).toBeNull()
    expect(parseTimecodeToSeconds('1:2:3:4')).toBeNull()
    expect(parseTimecodeToSeconds(null as unknown as string)).toBeNull()
  })
})

describe('secondsToTimecode', () => {
  it('formate MM:SS sous l’heure', () => {
    expect(secondsToTimecode(65)).toBe('01:05')
    expect(secondsToTimecode(59)).toBe('00:59')
    expect(secondsToTimecode(0)).toBe('00:00')
  })

  it('bascule en HH:MM:SS à partir d’une heure (> 59 min)', () => {
    expect(secondsToTimecode(3725)).toBe('01:02:05')
    expect(secondsToTimecode(3600)).toBe('01:00:00')
    expect(secondsToTimecode(3720)).toBe('01:02:00')
  })

  it('clamp les valeurs négatives', () => {
    expect(secondsToTimecode(-5)).toBe('00:00')
  })
})

describe('clockLabel (Minuterie MM:SS du classeur — minutes non bornées)', () => {
  it('conserve les minutes au-delà de 59', () => {
    expect(clockLabel(3725)).toBe('62:05')
    expect(clockLabel(5999)).toBe('99:59')
  })

  it('formate les valeurs courtes', () => {
    expect(clockLabel(0)).toBe('00:00')
    expect(clockLabel(59)).toBe('00:59')
    expect(clockLabel(65)).toBe('01:05')
  })
})

describe('isTimecodePairValid', () => {
  it('valide une paire début < fin', () => {
    expect(isTimecodePairValid('01:00', '02:30')).toBe(true)
  })

  it('rejette début === fin ou début > fin', () => {
    expect(isTimecodePairValid('01:00', '01:00')).toBe(false)
    expect(isTimecodePairValid('02:30', '01:00')).toBe(false)
  })

  it('rejette une borne invalide', () => {
    expect(isTimecodePairValid('abc', '02:30')).toBe(false)
    expect(isTimecodePairValid('01:00', '')).toBe(false)
  })
})
