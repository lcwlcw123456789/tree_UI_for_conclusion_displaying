/**
 * 解析结论段落中的标注，如 (IND_6)、(IND_8; IND_5)、(IND_13, IND_14, IND_15)
 * 支持格式: (IND_X) | (IND_X; IND_Y) | (IND_X, IND_Y, IND_Z)
 * 标注前的文本视为该标注引用的内容，高亮作用在文本本身
 */
import type { ParagraphSegment } from '../types/conclusion'

const ANNOTATION_REGEX = /\(IND_\d+(?:(?:;\s*|,\s*)IND_\d+)*\)/g

/**
 * 解析段落，将标注与前述文本合并为 cited 片段
 * 高亮和 hover 作用在文本本身，不展示标识符
 */
export function parseParagraph(paragraph: string): ParagraphSegment[] {
  const segments: ParagraphSegment[] = []
  let lastIndex = 0

  const matches = [...paragraph.matchAll(ANNOTATION_REGEX)]

  for (const match of matches) {
    const raw = match[0]
    const start = match.index!
    const end = start + raw.length

    const textBefore = paragraph.slice(lastIndex, start)
    const indicatorIds = parseIndicatorIds(raw)

    if (textBefore.length > 0) {
      segments.push({ type: 'cited', content: textBefore, indicatorIds })
    }

    lastIndex = end
  }

  if (lastIndex < paragraph.length) {
    const textAfter = paragraph.slice(lastIndex)
    if (textAfter.length > 0) {
      segments.push({ type: 'plain', content: textAfter })
    }
  }

  return segments
}

function parseIndicatorIds(raw: string): string[] {
  const inner = raw.slice(1, -1)
  return inner
    .split(/[;,]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('IND_'))
}

export function getPlainParagraph(paragraph: string): string {
  return paragraph.replace(ANNOTATION_REGEX, '').replace(/\s+/g, ' ').trim()
}
