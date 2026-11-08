export type PdfMetadata = {
  title: string
  author: string
  subject: string
  keywords: string
  creationDate: string
  modificationDate: string
  journal: string
  publicationDate: string
  volume: string
  issue: string
  doi: string
}

export type ExtractedDocument = {
  text: string
  firstPageText: string
  metadata: PdfMetadata
  status: 'extracted' | 'empty' | 'unsupported'
  diagnostics: string[]
}

const emptyMetadata: PdfMetadata = {
  title: '',
  author: '',
  subject: '',
  keywords: '',
  creationDate: '',
  modificationDate: '',
  journal: '',
  publicationDate: '',
  volume: '',
  issue: '',
  doi: '',
}

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

const formatPdfDate = (value: unknown) => {
  const raw = asString(value)
  const match = raw.match(/(?:D:)?(\d{4})-?(\d{2})?-?(\d{2})?/)
  if (!match) return raw

  const [, year, month = '01', day = '01'] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

const normalizePublicationDate = (value: string) => {
  const isoDate = value.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (!isoDate) return value

  const month = new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
  })
  return `${month} ${isoDate[1]}`
}

const getMetadataValue = (
  metadata: { get: (key: string) => unknown } | null,
  key: string,
) => {
  const value = metadata?.get(key)
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join('; ')
  }
  return ''
}

export const extractPdf = async (file: File): Promise<ExtractedDocument> => {
  const [{ getDocument, GlobalWorkerOptions }, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  GlobalWorkerOptions.workerSrc = workerUrl
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await loadingTask.promise

  try {
    const [metadataResult, ...pageTexts] = await Promise.all([
      pdf.getMetadata(),
      ...Array.from({ length: pdf.numPages }, async (_, index) => {
        const page = await pdf.getPage(index + 1)
        const content = await page.getTextContent()
        return content.items
          .flatMap((item) => {
            if (!('str' in item) || typeof item.str !== 'string') return []
            return [`${item.str}${item.hasEOL ? '\n' : ' '}`]
          })
          .join('')
          .replace(/[ \t]+\n/g, '\n')
          .trim()
      }),
    ])
    const info = metadataResult.info as Record<string, unknown>
    const metadata = metadataResult.metadata
    const text = pageTexts.join('\n\n').trim()
    const getInfo = (...keys: string[]) => {
      for (const key of keys) {
        const value = asString(info[key])
        if (value) return value
      }
      return ''
    }

    return {
      text,
      firstPageText: pageTexts[0] || '',
      metadata: {
        title: getMetadataValue(metadata, 'dc:title') || getInfo('Title', 'title'),
        author: getMetadataValue(metadata, 'dc:creator') || getInfo('Author', 'author'),
        subject: getMetadataValue(metadata, 'dc:description') || getInfo('Subject', 'subject'),
        keywords: getMetadataValue(metadata, 'pdf:Keywords') || getInfo('Keywords', 'keywords'),
        creationDate: formatPdfDate(
          getInfo('CreationDate', 'creationDate') || getMetadataValue(metadata, 'xmp:CreateDate'),
        ),
        modificationDate: formatPdfDate(
          getInfo('ModDate', 'modDate') || getMetadataValue(metadata, 'xmp:ModifyDate'),
        ),
        journal:
          getMetadataValue(metadata, 'prism:publicationName') ||
          getMetadataValue(metadata, 'dc:source'),
        publicationDate: getMetadataValue(metadata, 'prism:publicationDate'),
        volume: getMetadataValue(metadata, 'prism:volume'),
        issue: getMetadataValue(metadata, 'prism:number'),
        doi: getMetadataValue(metadata, 'prism:doi'),
      },
      status: text ? 'extracted' : 'empty',
      diagnostics: [
        `Parsed ${pdf.numPages} PDF page${pdf.numPages === 1 ? '' : 's'}.`,
        text ? `Extracted ${text.length.toLocaleString()} text characters.` : 'PDF parsed successfully but contains no extractable text.',
      ],
    }
  } finally {
    await pdf.destroy()
  }
}

export const extractDocument = async (file: File): Promise<ExtractedDocument> => {
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  if (extension === 'pdf') return extractPdf(file)

  if (['txt', 'csv', 'md'].includes(extension)) {
    const text = (await file.text()).trim()
    return {
      text,
      firstPageText: text,
      metadata: { ...emptyMetadata },
      status: text ? 'extracted' : 'empty',
      diagnostics: [
        text
          ? `Read ${text.length.toLocaleString()} text characters from the file.`
          : 'File was read successfully but is empty.',
      ],
    }
  }

  return {
    text: '',
    firstPageText: '',
    metadata: { ...emptyMetadata },
    status: 'unsupported',
    diagnostics: [`Content extraction is not implemented for .${extension || 'unknown'} files in this browser-only prototype.`],
  }
}

export const parsePublicationMetadata = (text: string, pdf: PdfMetadata, firstPageText = text) => {
  const normalizedText = text.replace(/\r/g, '')
  const lines = normalizedText
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const doi = pdf.doi || normalizedText.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i)?.[0]?.replace(/[.,;]+$/, '') || ''
  const journal =
    pdf.journal ||
    lines.find((line) => /journal of\b|proceedings of\b|transactions of\b/i.test(line)) ||
    ''
  const publicationDate = normalizePublicationDate(
    pdf.publicationDate ||
    normalizedText.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i)?.[0] ||
    '',
  )
  const volume =
    pdf.volume ||
    normalizedText.match(/\b(?:volume|vol\.?)\s*[:.]?\s*(\d{1,4})\b/i)?.[1] ||
    normalizedText.match(/;\s*(\d{1,4})\s*\(\s*\d{1,3}\s*\)/)?.[1] ||
    ''
  const issue =
    pdf.issue ||
    normalizedText.match(/\b(?:issue|no\.?)\s*[:.]?\s*(\d{1,3})\b/i)?.[1] ||
    normalizedText.match(/;\s*\d{1,4}\s*\(\s*(\d{1,3})\s*\)/)?.[1] ||
    ''
  const articleIdentifier =
    normalizedText.match(/\b(?:article(?:\s+(?:number|identifier))?\s*[:#]?\s*)?(e\d{4,8})\b/i)?.[1] || ''

  const firstPageNormalizedText = firstPageText.replace(/\r/g, '')
  const abstractStart = firstPageNormalizedText.search(/(?:^|\n)\s*abstract\s*[:.]?\s*/i)
  let abstract = ''
  if (abstractStart >= 0) {
    const heading = firstPageNormalizedText.slice(abstractStart).match(/(?:^|\n)\s*abstract\s*[:.]?\s*/i)?.[0] || ''
    const contentStart = abstractStart + heading.length
    const rest = firstPageNormalizedText.slice(contentStart)
    const endMatch = rest.match(/\n\s*(?:keywords?|key words|introduction|1\s*[|.]?\s*introduction)\s*[:.]?\s*/i)
    abstract = (endMatch ? rest.slice(0, endMatch.index) : rest.slice(0, 5000))
      .replace(/\s+/g, ' ')
      .trim()
  }

  const keywordMatch = firstPageNormalizedText.match(/(?:^|\n)\s*(?:keywords?|key words)\s*[:.]?\s*([\s\S]{1,500}?)(?=\n\s*(?:introduction|1\s*[|.]?\s*introduction|received|correspondence)\b|$)/i)
  const keywords = (pdf.keywords || keywordMatch?.[1] || '')
    .replace(/\s+/g, ' ')
    .trim()
  const authorText = pdf.author ||
    normalizedText.match(/(?:^|\n)\s*authors?\s*[:-]\s*([^\n]+)/i)?.[1] ||
    ''
  const authors = authorText
    .split(/\s*(?:;|\band\b)\s*|,\s*(?=[A-Z][a-z])/)
    .map((author) => author.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  return {
    journal,
    publicationDate,
    volume,
    issue,
    articleIdentifier,
    doi,
    pdfCreationDate: pdf.creationDate,
    pdfModificationDate: pdf.modificationDate,
    abstract,
    keywords,
    authors,
    lines,
  }
}
