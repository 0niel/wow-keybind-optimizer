import { parse } from 'csv-parse/sync'

export type CsvRecord = Record<string, string>

export function parseCsv(content: string): CsvRecord[] {
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as CsvRecord[]
}

export function asInt(record: CsvRecord, column: string): number {
  const raw = record[column]
  if (raw === undefined || raw === '') return 0
  const value = Number.parseInt(raw, 10)
  return Number.isNaN(value) ? 0 : value
}

export function asFloat(record: CsvRecord, column: string): number {
  const raw = record[column]
  if (raw === undefined || raw === '') return 0
  const value = Number.parseFloat(raw)
  return Number.isNaN(value) ? 0 : value
}
