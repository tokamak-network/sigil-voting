import { describe, it, expect } from 'vitest'
import { ko } from '../src/i18n/ko'
import { en } from '../src/i18n/en'

function getKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const val = obj[key]
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      keys.push(...getKeys(val as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys.sort()
}

describe('i18n completeness', () => {
  const koKeys = getKeys(ko as unknown as Record<string, unknown>)
  const enKeys = getKeys(en as unknown as Record<string, unknown>)

  it('ko and en have the same number of keys', () => {
    expect(koKeys.length).toBe(enKeys.length)
  })

  it('all ko keys exist in en', () => {
    const missingInEn = koKeys.filter(k => !enKeys.includes(k))
    expect(missingInEn, `Keys in ko but missing in en: ${missingInEn.join(', ')}`).toEqual([])
  })

  it('all en keys exist in ko', () => {
    const missingInKo = enKeys.filter(k => !koKeys.includes(k))
    expect(missingInKo, `Keys in en but missing in ko: ${missingInKo.join(', ')}`).toEqual([])
  })

  it('no empty string values in ko', () => {
    function findEmpty(obj: Record<string, unknown>, prefix = ''): string[] {
      const empty: string[] = []
      for (const key of Object.keys(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key
        const val = obj[key]
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          empty.push(...findEmpty(val as Record<string, unknown>, fullKey))
        } else if (val === '') {
          empty.push(fullKey)
        }
      }
      return empty
    }
    const emptyKeys = findEmpty(ko as unknown as Record<string, unknown>)
    // Some keys like "sub" may intentionally be empty
    // Filter those out
    const suspicious = emptyKeys.filter(k => !k.endsWith('.sub'))
    expect(suspicious, `Empty values in ko: ${suspicious.join(', ')}`).toEqual([])
  })

  it('no empty string values in en', () => {
    function findEmpty(obj: Record<string, unknown>, prefix = ''): string[] {
      const empty: string[] = []
      for (const key of Object.keys(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key
        const val = obj[key]
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          empty.push(...findEmpty(val as Record<string, unknown>, fullKey))
        } else if (val === '') {
          empty.push(fullKey)
        }
      }
      return empty
    }
    const emptyKeys = findEmpty(en as unknown as Record<string, unknown>)
    const suspicious = emptyKeys.filter(k => !k.endsWith('.sub'))
    expect(suspicious, `Empty values in en: ${suspicious.join(', ')}`).toEqual([])
  })
})
