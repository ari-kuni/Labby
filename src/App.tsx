import { useEffect, useMemo, useRef, useState } from 'react'
import { diffWords } from 'diff'
import {
  ArrowRightLeft,
  ChevronRight,
  Database,
  Download,
  FolderOpen,
  Search,
  Settings,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { extractDocument, parsePublicationMetadata } from './documentExtraction'

type NavView = 'documents' | 'search' | 'settings'
type IndexingStatus = 'Not Indexed' | 'Pending' | 'Indexing' | 'Indexed' | 'Failed'
type DocumentTypeId =
  | 'research_publication'
  | 'protocol_sop'
  | 'research_report'
  | 'experimental_data'
  | 'equipment_manual'
  | 'presentation'
  | 'thesis_dissertation'
  | 'code'
  | 'other'

type DateFilterField = 'publicationDate' | 'createdDate' | 'modifiedDate' | 'uploadedDate'

type ResearchGroup = {
  id: string
  name: string
  description: string
  createdAt: string
}

type DocumentVersion = {
  id: string
  documentId: string
  versionLabel: string
  filename: string
  uploadedAt: string
  author: string
  changeDescription: string
  fileType: string
  fileSize: number
  indexingStatus: IndexingStatus
  contentText?: string
  fileDataUrl?: string
  uploaderId?: string
  uploaderName?: string
}

type LabDocument = {
  id: string
  title: string
  description: string
  researchGroupId: string
  documentType: DocumentTypeId | string
  tags: string[]
  createdAt: string
  updatedAt: string
  currentVersionId: string
  author: string
  category?: DocumentCategory
  publicationMetadata?: PublicationMetadata
  codeMetadata?: CodeMetadata
  dateOverrides?: DocumentDateOverrides
  versions: DocumentVersion[]
}

type DocumentCategory = 'Research Publication' | 'Internal Laboratory Document' | 'Unclassified'

type PublicationMetadata = {
  journal: string
  publicationDate: string
  volume: string
  issue: string
  articleIdentifier: string
  doi: string
  pdfCreationDate: string
  pdfModificationDate: string
  abstract: string
  keywords: string
  subtype?: string
}

type DocumentDateOverrides = {
  publicationDate?: string
  createdDate?: string
  modifiedDate?: string
  revisedDate?: string
  effectiveDate?: string
}

type CodeMetadata = {
  programmingLanguage: string
  relatedProject: string
}

type ExtractionSource = 'Authenticated User' | 'System Timestamp' | 'Embedded Metadata' | 'Filename' | 'Document Content' | 'Existing Document History' | 'User Input'
type ReliabilityLevel = 'High' | 'Medium' | 'Low'

type MetadataSuggestion = {
  field: string
  value: string
  source: ExtractionSource
  confidence: ReliabilityLevel
  recommended: boolean
  evidence?: string
}

type UploadWarning = {
  level: 'info' | 'warning' | 'error'
  message: string
}

type UploadQueueItem = {
  id: string
  file: File
  title: string
  description: string
  groupId: string
  author: string
  documentType: DocumentTypeId
  category: DocumentCategory
  publicationMetadata: PublicationMetadata
  codeMetadata: CodeMetadata
  dateOverrides: DocumentDateOverrides
  tags: string
  suggestedGroupId?: string
  uploaderId: string
  uploaderName: string
  uploadedAt: string
  extractedText: string
  extracted: MetadataSuggestion[]
  warnings: UploadWarning[]
  extractionStatus: 'extracted' | 'empty' | 'unsupported' | 'failed'
  extractionDiagnostics: string[]
  relatedDocument?: string
  isAnalyzing?: boolean
}

type ComparisonMode = 'side-by-side' | 'unified'

const DB_NAME = 'labby-db'
const GROUP_STORE = 'researchGroups'
const DOCUMENT_STORE = 'documents'
const codeLanguageByExtension: Record<string, string> = {
  py: 'Python',
  ipynb: 'Jupyter Notebook',
  m: 'MATLAB / Objective-C',
  r: 'R',
  js: 'JavaScript',
  ts: 'TypeScript',
  tsx: 'TypeScript React',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  h: 'C / C++ Header',
  html: 'HTML',
  css: 'CSS',
  sql: 'SQL',
  json: 'JSON',
  sh: 'Shell',
}
const codeExtensions = Object.keys(codeLanguageByExtension)
const allowedExtensions = ['pdf', 'docx', 'txt', 'csv', 'xlsx', 'pptx', ...codeExtensions]
const textPreviewExtensions = ['txt', 'csv', 'md', ...codeExtensions]
const documentTypeOptions: Array<{ id: DocumentTypeId; label: string }> = [
  { id: 'research_publication', label: 'Research Publication' },
  { id: 'protocol_sop', label: 'Protocol / SOP' },
  { id: 'research_report', label: 'Research Report' },
  { id: 'experimental_data', label: 'Experimental Data' },
  { id: 'equipment_manual', label: 'Equipment Manual' },
  { id: 'presentation', label: 'Presentation' },
  { id: 'thesis_dissertation', label: 'Thesis / Dissertation' },
  { id: 'code', label: 'Code' },
  { id: 'other', label: 'Other' },
]
const publicationSubtypes = [
  'Original Research Article',
  'Review Article',
  'Preprint',
  'Conference Paper',
  'Other Publication',
]
const emptyPublicationMetadata: PublicationMetadata = {
  journal: '',
  publicationDate: '',
  volume: '',
  issue: '',
  articleIdentifier: '',
  doi: '',
  pdfCreationDate: '',
  pdfModificationDate: '',
  abstract: '',
  keywords: '',
  subtype: '',
}

const navItems: Array<{ id: NavView; label: string; icon: typeof FolderOpen }> = [
  { id: 'documents', label: 'Documents', icon: FolderOpen },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const LOCAL_DEVELOPMENT_USER = {
  id: 'local-development-user',
  name: 'Local Development User',
}

const defaultGroups: ResearchGroup[] = [
  {
    id: 'group-cardiovascular',
    name: 'Cardiovascular',
    description: 'Cardiac physiology and vascular tissue workflows.',
    createdAt: '2024-01-15T09:30:00.000Z',
  },
  {
    id: 'group-cancer',
    name: 'Cancer',
    description: 'Oncology and molecular imaging study protocols.',
    createdAt: '2024-01-20T09:30:00.000Z',
  },
  {
    id: 'group-musculoskeletal',
    name: 'Musculoskeletal',
    description: 'Matrix design and tissue mechanics SOPs.',
    createdAt: '2024-01-24T09:30:00.000Z',
  },
  {
    id: 'group-uncategorized',
    name: 'Uncategorized',
    description: 'Unassigned or experimental documents.',
    createdAt: '2024-01-05T09:30:00.000Z',
  },
]

const defaultDocuments: LabDocument[] = [
  {
    id: 'doc-cardiac-culture',
    title: 'Cardiac Cell Culture Protocol',
    description: 'Protocol for maintaining cardiomyocyte cultures and media changes.',
    researchGroupId: 'group-cardiovascular',
    documentType: 'protocol',
    tags: ['cardiac', 'culture', 'cells'],
    createdAt: '2024-04-02T11:00:00.000Z',
    updatedAt: '2024-04-12T15:30:00.000Z',
    author: 'Dr. S. Patel',
    currentVersionId: 'ver-cardiac-v3',
    versions: [
      {
        id: 'ver-cardiac-v1',
        documentId: 'doc-cardiac-culture',
        versionLabel: 'Version 1',
        filename: 'Cardiac_Cell_Culture_Protocol_v1.txt',
        uploadedAt: '2024-04-02T11:00:00.000Z',
        author: 'Dr. S. Patel',
        changeDescription: 'Initial draft of the culture maintenance protocol.',
        fileType: 'txt',
        fileSize: 8240,
        indexingStatus: 'Indexed',
        contentText:
          'Cardiac Cell Culture Protocol\n\nObjective\nCulture primary cardiomyocytes for 14-day maintenance using serum-supplemented media.\n\nMaterials\n- Media reservoir\n- ECM-coated plates\n- Incubator at 37C\n\nProcedure\n1. Thaw cells and seed at 1.5 x 10^5 cells/cm^2.\n2. Replace media every 48 hours.\n3. Monitor confluency with brightfield imaging.',
      },
      {
        id: 'ver-cardiac-v2',
        documentId: 'doc-cardiac-culture',
        versionLabel: 'Version 2',
        filename: 'Cardiac_Cell_Culture_Protocol_v2.txt',
        uploadedAt: '2024-04-07T10:00:00.000Z',
        author: 'Dr. S. Patel',
        changeDescription: 'Added media refresh schedule for high-density plates.',
        fileType: 'txt',
        fileSize: 9150,
        indexingStatus: 'Indexed',
        contentText:
          'Cardiac Cell Culture Protocol\n\nObjective\nCulture primary cardiomyocytes for 14-day maintenance using serum-supplemented media.\n\nMaterials\n- Media reservoir\n- ECM-coated plates\n- Incubator at 37C\n\nProcedure\n1. Thaw cells and seed at 1.5 x 10^5 cells/cm^2.\n2. Replace media every 48 hours, with a 24-hour interval for high-density plates.\n3. Monitor confluency with brightfield imaging.',
      },
      {
        id: 'ver-cardiac-v3',
        documentId: 'doc-cardiac-culture',
        versionLabel: 'Version 3',
        filename: 'Cardiac_Cell_Culture_Protocol_v3.txt',
        uploadedAt: '2024-04-12T15:30:00.000Z',
        author: 'Dr. S. Patel',
        changeDescription: 'Updated viability check and clarified imaging intervals.',
        fileType: 'txt',
        fileSize: 9800,
        indexingStatus: 'Indexed',
        contentText:
          'Cardiac Cell Culture Protocol\n\nObjective\nCulture primary cardiomyocytes for 14-day maintenance using serum-supplemented media.\n\nMaterials\n- Media reservoir\n- ECM-coated plates\n- Incubator at 37C\n- Calibrated phase contrast microscope\n\nProcedure\n1. Thaw cells and seed at 1.5 x 10^5 cells/cm^2.\n2. Replace media every 48 hours, with a 24-hour interval for high-density plates.\n3. Monitor confluency and viability with brightfield imaging every 2 days.',
      },
    ],
  },
  {
    id: 'doc-hydrogel-protocol',
    title: 'Hydrogel Preparation Protocol',
    description: 'SOP for mixing gel precursor solutions and curing conditions.',
    researchGroupId: 'group-musculoskeletal',
    documentType: 'protocol',
    tags: ['hydrogel', 'materials', 'sop'],
    createdAt: '2024-04-09T09:00:00.000Z',
    updatedAt: '2024-04-19T12:00:00.000Z',
    author: 'A. Mendez',
    currentVersionId: 'ver-hydrogel-v5',
    versions: [
      {
        id: 'ver-hydrogel-v1',
        documentId: 'doc-hydrogel-protocol',
        versionLabel: 'Version 1',
        filename: 'Hydrogel_Preparation_Protocol_v1.txt',
        uploadedAt: '2024-04-09T09:00:00.000Z',
        author: 'A. Mendez',
        changeDescription: 'Original procedure for hydrogel fabrication and curing.',
        fileType: 'txt',
        fileSize: 9300,
        indexingStatus: 'Indexed',
        contentText:
          'Hydrogel Preparation Protocol\n\nObjective\nPrepare collagen hydrogel scaffolds for matrix stiffness testing.\n\nMaterials\n- Collagen I solution\n- PBS buffer\n- Crosslinker stock\n\nProcedure\n1. Chill reagents on ice.\n2. Mix collagen and buffer to final concentration.\n3. Add crosslinker and cast into molds.\n4. Incubate at 37C for 45 minutes.',
      },
      {
        id: 'ver-hydrogel-v2',
        documentId: 'doc-hydrogel-protocol',
        versionLabel: 'Version 2',
        filename: 'Hydrogel_Preparation_Protocol_v2.txt',
        uploadedAt: '2024-04-11T09:00:00.000Z',
        author: 'A. Mendez',
        changeDescription: 'Adjusted buffer composition for improved gelation consistency.',
        fileType: 'txt',
        fileSize: 10450,
        indexingStatus: 'Indexed',
        contentText:
          'Hydrogel Preparation Protocol\n\nObjective\nPrepare collagen hydrogel scaffolds for matrix stiffness testing.\n\nMaterials\n- Collagen I solution\n- PBS buffer\n- Crosslinker stock\n- pH indicator strip\n\nProcedure\n1. Chill reagents on ice.\n2. Mix collagen and buffer to final concentration.\n3. Add crosslinker and cast into molds.\n4. Incubate at 37C for 45 minutes, then verify pH range.',
      },
      {
        id: 'ver-hydrogel-v3',
        documentId: 'doc-hydrogel-protocol',
        versionLabel: 'Version 3',
        filename: 'Hydrogel_Preparation_Protocol_v3.txt',
        uploadedAt: '2024-04-15T09:00:00.000Z',
        author: 'A. Mendez',
        changeDescription: 'Introduced a staged mixing protocol to improve reproducibility.',
        fileType: 'txt',
        fileSize: 11120,
        indexingStatus: 'Indexed',
        contentText:
          'Hydrogel Preparation Protocol\n\nObjective\nPrepare collagen hydrogel scaffolds for matrix stiffness testing.\n\nMaterials\n- Collagen I solution\n- PBS buffer\n- Crosslinker stock\n- pH indicator strip\n- 15 mL conical tubes\n\nProcedure\n1. Chill reagents on ice.\n2. Mix collagen and buffer in a conical tube to final concentration.\n3. Add crosslinker, mix gently, and cast into molds.\n4. Incubate at 37C for 45 minutes, then verify pH range.',
      },
      {
        id: 'ver-hydrogel-v4',
        documentId: 'doc-hydrogel-protocol',
        versionLabel: 'Version 4',
        filename: 'Hydrogel_Preparation_Protocol_v4.txt',
        uploadedAt: '2024-04-17T11:45:00.000Z',
        author: 'A. Mendez',
        changeDescription: 'Reduced incubation time after gelation check.',
        fileType: 'txt',
        fileSize: 11620,
        indexingStatus: 'Indexed',
        contentText:
          'Hydrogel Preparation Protocol\n\nObjective\nPrepare collagen hydrogel scaffolds for matrix stiffness testing.\n\nMaterials\n- Collagen I solution\n- PBS buffer\n- Crosslinker stock\n- pH indicator strip\n- 15 mL conical tubes\n\nProcedure\n1. Chill reagents on ice.\n2. Mix collagen and buffer in a conical tube to final concentration.\n3. Add crosslinker, mix gently, and cast into molds.\n4. Incubate at 37C for 35 minutes and verify pH range before removal.',
      },
      {
        id: 'ver-hydrogel-v5',
        documentId: 'doc-hydrogel-protocol',
        versionLabel: 'Version 5',
        filename: 'Hydrogel_Preparation_Protocol_v5.txt',
        uploadedAt: '2024-04-19T12:00:00.000Z',
        author: 'A. Mendez',
        changeDescription: 'Final protocol revision with streamlined handling and quality check.',
        fileType: 'txt',
        fileSize: 11950,
        indexingStatus: 'Indexed',
        contentText:
          'Hydrogel Preparation Protocol\n\nObjective\nPrepare collagen hydrogel scaffolds for matrix stiffness testing.\n\nMaterials\n- Collagen I solution\n- PBS buffer\n- Crosslinker stock\n- pH indicator strip\n- 15 mL conical tubes\n- Sterile molds\n\nProcedure\n1. Chill reagents on ice.\n2. Mix collagen and buffer in a conical tube to final concentration.\n3. Add crosslinker, mix gently, and cast into sterile molds.\n4. Incubate at 37C for 35 minutes and verify pH range before removal.\n5. Inspect molded gels for uniformity before testing.',
      },
    ],
  },
  {
    id: 'doc-imaging-procedure',
    title: 'Fluorescence Imaging Procedure',
    description: 'Image acquisition workflow for staining and imaging tumor sections.',
    researchGroupId: 'group-cancer',
    documentType: 'equipment manual',
    tags: ['imaging', 'fluorescence', 'cancer'],
    createdAt: '2024-02-18T14:00:00.000Z',
    updatedAt: '2024-03-09T16:20:00.000Z',
    author: 'L. Nguyen',
    currentVersionId: 'ver-imaging-v2',
    versions: [
      {
        id: 'ver-imaging-v1',
        documentId: 'doc-imaging-procedure',
        versionLabel: 'Version 1',
        filename: 'Fluorescence_Imaging_Procedure_v1.txt',
        uploadedAt: '2024-02-18T14:00:00.000Z',
        author: 'L. Nguyen',
        changeDescription: 'Draft imaging checklist for autocalibration and exposure setting.',
        fileType: 'txt',
        fileSize: 8700,
        indexingStatus: 'Indexed',
        contentText:
          'Fluorescence Imaging Procedure\n\nObjective\nAcquire fluorescence images of tumor sections with consistent exposure and acquisition settings.\n\nMaterials\n- Fluorescent microscope\n- DAPI and FITC filters\n- Slide holder\n\nProcedure\n1. Calibrate lamp intensity.\n2. Place slide on stage.\n3. Capture images at 10x magnification.\n4. Save images to the shared drive.',
      },
      {
        id: 'ver-imaging-v2',
        documentId: 'doc-imaging-procedure',
        versionLabel: 'Version 2',
        filename: 'Fluorescence_Imaging_Procedure_v2.txt',
        uploadedAt: '2024-03-09T16:20:00.000Z',
        author: 'L. Nguyen',
        changeDescription: 'Added channel calibration and corrected exposure range.',
        fileType: 'txt',
        fileSize: 9200,
        indexingStatus: 'Indexed',
        contentText:
          'Fluorescence Imaging Procedure\n\nObjective\nAcquire fluorescence images of tumor sections with consistent exposure and acquisition settings.\n\nMaterials\n- Fluorescent microscope\n- DAPI and FITC filters\n- Slide holder\n- Channel calibration slide\n\nProcedure\n1. Calibrate lamp intensity and verify channel alignment.\n2. Place slide on stage.\n3. Capture images at 10x and 20x magnification.\n4. Save images to the shared drive and document exposure settings.',
      },
    ],
  },
]

const getSuggestedGroupId = (content: string, groups: ResearchGroup[]) => {
  const insertName = content.toLowerCase()
  if (/(cardiac|cardiovascular|heart|cardiomyocyte|spheroid|stem cell)/.test(insertName)) {
    return groups.find((group) => group.name === 'Cardiovascular')?.id
  }
  if (/(tumou?r|cancer|oncology|fluorescence)/.test(insertName)) {
    return groups.find((group) => group.name === 'Cancer')?.id
  }
  if (/(hydrogel|stiffness|muscle|musculoskeletal)/.test(insertName)) {
    return groups.find((group) => group.name === 'Musculoskeletal')?.id
  }
  return groups.find((group) => group.name === 'Uncategorized')?.id
}

const normalizeFileNameForTitle = (fileName: string) =>
  fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(?:version|v|rev(?:ision)?|draft)\s*[:-]?\s*\d+(?:\.\d+)?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

const getFileExtension = (fileName: string) => fileName.split('.').pop()?.toLowerCase() || 'txt'

const detectVersionNumber = (value: string) => {
  if (!value) return null
  const match = value.match(/\b(?:version|v|rev(?:ision)?|draft)\s*[:-]?\s*(\d+(?:\.\d+)?)\b/i)
  if (!match) return null
  return { version: match[1], evidence: match[0].trim() }
}

const normalizeDocumentType = (value: string): DocumentTypeId => {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ')
  if (['research publication', 'paper', 'publication', 'manuscript'].includes(normalized)) return 'research_publication'
  if (['protocol', 'sop', 'procedure', 'protocol / sop'].includes(normalized)) return 'protocol_sop'
  if (['report', 'research report', 'study'].includes(normalized)) return 'research_report'
  if (['data', 'dataset', 'experimental data', 'analysis'].includes(normalized)) return 'experimental_data'
  if (['equipment manual', 'manual'].includes(normalized)) return 'equipment_manual'
  if (normalized === 'presentation' || normalized === 'slides') return 'presentation'
  if (['thesis', 'dissertation', 'thesis / dissertation'].includes(normalized)) return 'thesis_dissertation'
  if (['code', 'source code', 'software'].includes(normalized)) return 'code'

  const inferred = value.toLowerCase()
  if (/(protocol|procedure|sop|workflow|method)/.test(inferred)) return 'protocol_sop'
  if (/(publication|paper|manuscript|journal|preprint)/.test(inferred)) return 'research_publication'
  if (/(report|study|abstract)/.test(inferred)) return 'research_report'
  if (/(manual|equipment|instrument|device|microscope)/.test(inferred)) return 'equipment_manual'
  if (/(data|dataset|analysis|statistics|results)/.test(inferred)) return 'experimental_data'
  if (/presentation|slides|powerpoint/.test(inferred)) return 'presentation'
  if (/thesis|dissertation/.test(inferred)) return 'thesis_dissertation'
  if (/\b(code|software|programming)\b/.test(inferred)) return 'code'
  return 'other'
}

const getCodeLanguage = (fileName: string, content = '') => {
  const extension = getFileExtension(fileName)
  if (extension !== 'json') return codeLanguageByExtension[extension] || ''

  const basename = fileName.split(/[\\/]/).pop()?.toLowerCase() || ''
  const projectJsonName = /^(package|tsconfig|jsconfig|webpack|babel|composer|manifest)\.json$/.test(basename)
  const projectJsonContent = /"(?:scripts|dependencies|devDependencies|compilerOptions|autoload)"\s*:/.test(content)
  return projectJsonName || projectJsonContent ? 'JSON' : ''
}

const inferDocumentType = (value: string, fileName = ''): DocumentTypeId => {
  if (getCodeLanguage(fileName, value)) return 'code'
  const normalized = value.toLowerCase()
  if (/(protocol|procedure|sop|workflow|method)/.test(normalized)) return 'protocol_sop'
  if (/(paper|manuscript|publication|journal|preprint)/.test(normalized)) return 'research_publication'
  if (/(report|study|abstract)/.test(normalized)) return 'research_report'
  if (/(manual|equipment|instrument|device|microscope)/.test(normalized)) return 'equipment_manual'
  if (/(data|dataset|analysis|statistics|results)/.test(normalized)) return 'experimental_data'
  if (/(presentation|slides|powerpoint)/.test(normalized)) return 'presentation'
  if (/(thesis|dissertation)/.test(normalized)) return 'thesis_dissertation'
  return 'other'
}

const getDocumentTypeLabel = (value: string) =>
  documentTypeOptions.find((option) => option.id === normalizeDocumentType(value))?.label || 'Other'

const normalizeSearchText = (value: string) =>
  value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

const matchesAuthorQuery = (author: string, query: string) => {
  const queryTokens = normalizeSearchText(query).split(/\s+/).filter(Boolean)
  const authorTokens = normalizeSearchText(author).split(/\s+/).filter(Boolean)
  return queryTokens.length > 0 && queryTokens.every((queryToken) =>
    authorTokens.some((authorToken) => authorToken === queryToken || authorToken.startsWith(queryToken)),
  )
}

const getDocumentAuthors = (document: LabDocument) => {
  const authorList = document.author.trim()
  if (!authorList) return []
  const separators = /;\s*|\s+\band\b\s+/
  const authors = authorList.split(separators).flatMap((author) =>
    author.includes(',') ? author.split(/,\s*(?=[A-Z][a-z])/i) : [author],
  )
  return [...new Map(authors.map((author) => [normalizeSearchText(author), author.trim()])).values()].filter(Boolean)
}

const getFirstAuthor = (document: LabDocument) => getDocumentAuthors(document)[0] || ''

const getTableAuthor = (document: LabDocument) => {
  const authors = getDocumentAuthors(document)
  if (authors.length > 1 && getDocumentCategory(document) === 'Research Publication') {
    return `${authors[0]} et al.`
  }
  return authors[0] || 'Unknown Author'
}

const inferTitleFromText = (text: string, fallback: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const heading = lines.find((line) => {
    const lengthOk = line.length > 5 && line.length < 90
    const likelyTitle = !/^(objective|materials|method|procedure|results|discussion|summary|abstract|notes|author|prepared by|version|last revised)/i.test(line)
    return lengthOk && likelyTitle
  })

  return heading || fallback
}

const inferDescriptionFromText = (text: string, fallback: string) => {
  if (!text) return fallback

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  const decisionParagraph = paragraphs.find((paragraph) => {
    const normalized = paragraph.toLowerCase()
    return normalized.includes('objective') || normalized.includes('purpose') || normalized.includes('summary') || normalized.includes('abstract')
  })

  if (decisionParagraph) {
    const sentence = decisionParagraph.replace(/\s+/g, ' ').trim()
    return sentence.length > 180 ? `${sentence.slice(0, 177)}...` : sentence
  }

  const firstParagraph = paragraphs[0]
  if (!firstParagraph) return fallback
  const sentence = firstParagraph.replace(/\s+/g, ' ').trim()
  return sentence.length > 180 ? `${sentence.slice(0, 177)}...` : sentence
}

const inferAuthorFromText = (text: string) => {
  const match = text.match(/(?:Prepared by|Author|Authors|Lead author|Principal investigator|PI)\s*:?\s*([A-Z][A-Za-z. -]{2,60})/i)
  if (match) return match[1].trim()

  const preparedByMatch = text.match(/Prepared by:\s*([A-Za-z .'-]+)/i)
  if (preparedByMatch) return preparedByMatch[1].trim()

  return null
}

const inferTagsFromText = (text: string, fileName: string) => {
  const combined = `${text} ${fileName}`.toLowerCase()
  const keywords = new Set<string>()
  const keywordMap: Record<string, string[]> = {
    cardiac: ['cardiac', 'heart', 'culture'],
    cancer: ['cancer', 'tumor', 'fluorescence'],
    hydrogel: ['hydrogel', 'gel', 'stiffness'],
    imaging: ['imaging', 'microscope', 'fluorescence'],
    protocol: ['protocol', 'procedure', 'sop'],
    data: ['data', 'analysis', 'results'],
  }

  for (const [label, terms] of Object.entries(keywordMap)) {
    if (terms.some((term) => combined.includes(term))) {
      keywords.add(label)
    }
  }

  return [...keywords].slice(0, 4)
}

const findRelatedDocument = (fileName: string, existingDocuments: LabDocument[]) => {
  const normalized = normalizeFileNameForTitle(fileName).toLowerCase()

  const match = existingDocuments.find((document) => {
    const titleMatch = document.title.toLowerCase().includes(normalized) || normalized.includes(document.title.toLowerCase())
    const versionMatch = document.versions.some((version) => version.filename.toLowerCase().includes(normalized))
    return titleMatch || versionMatch
  })

  return match?.title || undefined
}

const analyzeUploadedFile = async (file: File, documents: LabDocument[], groups: ResearchGroup[]) => {
  const filenameTitle = normalizeFileNameForTitle(file.name)
  let extraction: Awaited<ReturnType<typeof extractDocument>>
  let extractionError = ''
  try {
    extraction = await extractDocument(file)
  } catch (error) {
    extractionError = error instanceof Error ? error.message : String(error)
    extraction = {
      text: '',
      firstPageText: '',
      metadata: {
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
      },
      status: 'empty',
      diagnostics: [],
    }
  }

  const fileText = extraction.text
  const codeLanguage = getCodeLanguage(file.name, fileText)
  const publication = parsePublicationMetadata(fileText, extraction.metadata, extraction.firstPageText)
  const publicationDetected = Boolean(
    publication.doi ||
      publication.journal ||
      publication.abstract ||
      /\b(?:research article|original article|journal article)\b/i.test(fileText),
  )
  const category: DocumentCategory = codeLanguage
    ? 'Internal Laboratory Document'
    : extractionError
      ? 'Unclassified'
    : publicationDetected
      ? 'Research Publication'
      : fileText
        ? 'Internal Laboratory Document'
        : 'Unclassified'
  const fileSource = `${file.name}\n${fileText}`
  const versionMatch = detectVersionNumber(fileSource)
  const documentTitle =
    extraction.metadata.title ||
    inferTitleFromText(fileText, '') ||
    filenameTitle
  const inferredAuthor = inferAuthorFromText(fileText)
  const author = publication.authors.length
    ? publication.authors.join('; ')
    : extraction.metadata.author || inferredAuthor || ''
  const documentType = category === 'Research Publication'
    ? 'research_publication'
    : codeLanguage
      ? 'code'
      : inferDocumentType(`${file.name} ${fileText}`, file.name)
  const suggestedGroupId = getSuggestedGroupId(fileSource, groups)
  const candidateGroupId =
    suggestedGroupId || groups.find((group) => group.name === 'Uncategorized')?.id || ''
  const publicationMetadata: PublicationMetadata = {
    journal: publication.journal,
    publicationDate: publication.publicationDate,
    volume: publication.volume,
    issue: publication.issue,
    articleIdentifier: publication.articleIdentifier,
    doi: publication.doi,
    pdfCreationDate: publication.pdfCreationDate,
    pdfModificationDate: publication.pdfModificationDate,
    abstract: publication.abstract,
    keywords: publication.keywords,
    subtype: '',
  }
  const tags = publication.keywords
    ? publication.keywords.split(/[,;|]/).map((tag) => tag.trim()).filter(Boolean)
    : inferTagsFromText(fileText, file.name)
  const relatedDocument = findRelatedDocument(file.name, documents)
  const warnings: UploadWarning[] = []

  if (extractionError) {
    warnings.push({
      level: 'error',
      message: `Content extraction failed: ${extractionError}`,
    })
  } else if (extraction.status === 'empty') {
    warnings.push({
      level: 'warning',
      message: 'The file was read successfully, but no extractable text was found.',
    })
  } else if (extraction.status === 'unsupported') {
    warnings.push({
      level: 'warning',
      message: 'This file type is saved locally, but its contents are not yet supported by the local extractor.',
    })
  }

  if (relatedDocument) {
    warnings.push({
      level: 'warning',
      message: `Possible existing document match: ${relatedDocument}. Confirm whether this should be a new version or a separate document.`,
    })
  }

  if (versionMatch) {
    warnings.push({
      level: 'info',
      message: `Version detected from ${versionMatch.evidence}.`,
    })
  }

  const extracted: MetadataSuggestion[] = [
    {
      field: 'Document title',
      value: documentTitle,
      source: (extraction.metadata.title ? 'Embedded Metadata' : fileText ? 'Document Content' : 'Filename') as ExtractionSource,
      confidence: extraction.metadata.title || fileText ? 'High' : 'Low',
      recommended: true,
      evidence: extraction.metadata.title ? 'Title read from embedded PDF metadata.' : fileText ? 'Title inferred from extracted document text.' : file.name,
    },
    ...(author ? [{
      field: 'Author',
      value: author,
      source: (extraction.metadata.author ? 'Embedded Metadata' : 'Document Content') as ExtractionSource,
      confidence: 'High' as ReliabilityLevel,
      recommended: true,
      evidence: extraction.metadata.author || inferredAuthor || 'Author names extracted from the publication front matter.',
    }] : []),
    {
      field: 'Version number',
      value: versionMatch?.version || 'Unspecified',
      source: (versionMatch ? 'Filename' : 'Document Content') as ExtractionSource,
      confidence: versionMatch ? 'Medium' : 'Low',
      recommended: true,
      evidence: versionMatch ? versionMatch.evidence : 'No version marker was found in the filename or extracted text.',
    },
    {
      field: 'Document type',
      value: documentType,
      source: 'Document Content' as ExtractionSource,
      confidence: fileText ? 'High' : 'Low',
      recommended: true,
      evidence: fileText ? 'Inferred from extracted document content.' : file.name,
    },
    ...(fileText ? [{
      field: 'Description',
      value: publication.abstract || inferDescriptionFromText(fileText, ''),
      source: 'Document Content' as ExtractionSource,
      confidence: 'Medium' as ReliabilityLevel,
      recommended: true,
      evidence: publication.abstract ? 'Abstract extracted from the publication.' : 'Summary inferred from extracted document text.',
    }] : []),
    ...(tags.length > 0 ? [{
      field: 'Tags',
      value: tags.join(', '),
      source: 'Document Content' as ExtractionSource,
      confidence: 'Medium' as ReliabilityLevel,
      recommended: false,
      evidence: publication.keywords ? 'Author-provided publication keywords.' : 'Terms inferred from document content.',
    }] : []),
    ...(documentType === 'code' ? [{
      field: 'Programming language',
      value: codeLanguage,
      source: 'Filename' as ExtractionSource,
      confidence: 'High' as ReliabilityLevel,
      recommended: true,
      evidence: `Inferred from the .${getFileExtension(file.name)} file extension.`,
    }] : []),
    ...([
      ['Journal', publication.journal],
      ['Publication date', publication.publicationDate],
      ['Volume', publication.volume],
      ['Issue', publication.issue],
      ['Article identifier', publication.articleIdentifier],
      ['DOI', publication.doi],
      ['PDF creation date', publication.pdfCreationDate],
      ['PDF modification date', publication.pdfModificationDate],
      ['Author keywords', publication.keywords],
    ] as Array<[string, string]>)
      .filter(([, value]) => Boolean(value))
      .map(([field, value]) => ({
        field,
        value,
        source: field.startsWith('PDF ') || field === 'Journal' ? 'Embedded Metadata' as ExtractionSource : 'Document Content' as ExtractionSource,
        confidence: 'High' as ReliabilityLevel,
        recommended: true,
        evidence: field === 'Abstract' || field === 'Author keywords' ? 'Extracted from publication text.' : 'Read from embedded metadata or publication text.',
      })),
  ]

  return {
    id: crypto.randomUUID(),
    file,
    title: documentTitle,
    description: publication.abstract || (fileText ? inferDescriptionFromText(fileText, '') : ''),
    groupId: candidateGroupId,
    author,
    documentType,
    category,
    publicationMetadata,
    codeMetadata: { programmingLanguage: codeLanguage, relatedProject: '' },
    dateOverrides: codeLanguage && file.lastModified
      ? { modifiedDate: new Date(file.lastModified).toISOString().slice(0, 10) }
      : {},
    tags: tags.join(', '),
    suggestedGroupId: candidateGroupId,
    uploaderId: LOCAL_DEVELOPMENT_USER.id,
    uploaderName: LOCAL_DEVELOPMENT_USER.name,
    uploadedAt: '',
    extractedText: fileText,
    extracted,
    warnings,
    extractionStatus: extractionError ? 'failed' : extraction.status,
    extractionDiagnostics: extractionError ? [`${file.name}: ${extractionError}`] : extraction.diagnostics,
    relatedDocument,
    isAnalyzing: false,
  } satisfies UploadQueueItem
}

const readFileAsDataUrl = (file: File, onProgress?: (progress: number | null) => void) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to load file'))
    reader.onprogress = (event) => {
      onProgress?.(event.lengthComputable && event.total > 0 ? event.loaded / event.total : null)
    }
    reader.readAsDataURL(file)
  })

const getDownloadMimeType = (version: DocumentVersion) => {
  const mimeTypeByExtension: Record<string, string> = {
    pdf: 'application/pdf',
    txt: 'text/plain',
    csv: 'text/csv',
    md: 'text/markdown',
    py: 'text/x-python',
    ipynb: 'application/x-ipynb+json',
    m: 'text/plain',
    r: 'text/plain',
    js: 'text/javascript',
    ts: 'text/typescript',
    tsx: 'text/typescript',
    java: 'text/x-java-source',
    cpp: 'text/x-c++src',
    c: 'text/x-csrc',
    h: 'text/x-chdr',
    html: 'text/html',
    css: 'text/css',
    sql: 'application/sql',
    json: 'application/json',
    sh: 'application/x-sh',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }
  return mimeTypeByExtension[version.fileType.toLowerCase()] || 'application/octet-stream'
}

const downloadVersionFile = (version: DocumentVersion) => {
  if (!version.fileDataUrl) throw new Error('The selected version does not contain a downloadable file.')

  const dataUrlMatch = version.fileDataUrl.match(/^data:([^;,]*)(;base64)?,([\s\S]*)$/)
  if (!dataUrlMatch) throw new Error('The stored file data is not in a downloadable format.')

  const [, storedMimeType, base64Marker, encodedData] = dataUrlMatch
  let bytes: Uint8Array
  try {
    if (base64Marker) {
      const binary = window.atob(encodedData)
      bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(encodedData))
    }
  } catch (error) {
    throw new Error(`Unable to decode ${version.filename}: ${error instanceof Error ? error.message : String(error)}`)
  }

  const blobData = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(blobData).set(bytes)
  const fileBlob = new Blob([blobData], { type: storedMimeType || getDownloadMimeType(version) })
  const objectUrl = URL.createObjectURL(fileBlob)
  const anchor = window.document.createElement('a')
  anchor.href = objectUrl
  anchor.download = version.filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(GROUP_STORE)) {
        db.createObjectStore(GROUP_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(DOCUMENT_STORE)) {
        db.createObjectStore(DOCUMENT_STORE, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB failed to open'))
  })

const writeStore = async (storeName: string, values: unknown[]) => {
  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)

    values.forEach((value) => store.put(value))

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('Could not save data'))
  })
}

const readStore = async <T,>(storeName: string) => {
  const db = await openDatabase()
  return new Promise<T[]>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly')
    const store = transaction.objectStore(storeName)
    const request = store.getAll()

    request.onsuccess = () => resolve((request.result as T[]) || [])
    request.onerror = () => reject(request.error || new Error('Could not read data'))
  })
}

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

const formatDocumentDate = (value?: string) => {
  if (!value) return ''
  if (/^\d{4}$/.test(value)) return value
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) {
    const parsedDate = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    return Number.isNaN(parsedDate.getTime())
      ? value
      : parsedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }
  const monthYear = value.match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (monthYear) {
    const parsedMonth = new Date(`${monthYear[1]} 1, ${monthYear[2]}`)
    if (!Number.isNaN(parsedMonth.getTime())) {
      return parsedMonth.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    }
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const parseDateValue = (value?: string) => {
  if (!value) return null
  if (/^\d{4}$/.test(value)) return new Date(Number(value), 0, 1).getTime()
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])).getTime()
  const monthYear = value.match(/^([A-Za-z]+)\s+(\d{4})$/)
  const normalized = monthYear ? `${monthYear[1]} 1, ${monthYear[2]}` : value
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

const isDateInRange = (value: string, startValue: string, endValue: string) => {
  const parsed = parseDateValue(value)
  if (parsed === null) return false
  const start = startValue ? new Date(`${startValue}T00:00:00`).getTime() : null
  const end = endValue ? new Date(`${endValue}T23:59:59.999`).getTime() : null
  const monthYear = value.match(/^([A-Za-z]+)\s+(\d{4})$/)
  const yearOnly = value.match(/^\d{4}$/)
  let dateStart = parsed
  let dateEnd = parsed
  if (monthYear) {
    const monthStart = new Date(`${monthYear[1]} 1, ${monthYear[2]}`)
    dateStart = monthStart.getTime()
    dateEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999).getTime()
  } else if (yearOnly) {
    dateStart = new Date(Number(yearOnly[0]), 0, 1).getTime()
    dateEnd = new Date(Number(yearOnly[0]), 11, 31, 23, 59, 59, 999).getTime()
  }
  return (start === null || dateEnd >= start) && (end === null || dateStart <= end)
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const getVersionContent = (version: DocumentVersion) =>
  version.contentText || 'Preview unsupported for this file type.'

const getDocumentCategory = (document: LabDocument): DocumentCategory =>
  normalizeDocumentType(document.documentType) === 'research_publication'
    ? 'Research Publication'
    : document.category === 'Unclassified'
      ? 'Unclassified'
      : 'Internal Laboratory Document'

const getLatestUploadDate = (document: LabDocument) =>
  [...document.versions].sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt))[0]?.uploadedAt || ''

const getDateForField = (document: LabDocument, field: DateFilterField) => {
  const overrides = document.dateOverrides || {}
  const publication = document.publicationMetadata
  if (field === 'publicationDate') return overrides.publicationDate || publication?.publicationDate || ''
  if (field === 'createdDate') return overrides.createdDate || publication?.pdfCreationDate || document.createdAt || ''
  if (field === 'modifiedDate') {
    return overrides.modifiedDate || overrides.revisedDate || publication?.pdfModificationDate || document.updatedAt || ''
  }
  return getLatestUploadDate(document)
}

const getPreferredDocumentDate = (document: LabDocument) => {
  const overrides = document.dateOverrides || {}
  const publication = document.publicationMetadata
  if (normalizeDocumentType(document.documentType) === 'research_publication') {
    if (overrides.publicationDate || publication?.publicationDate) {
      return { value: overrides.publicationDate || publication?.publicationDate || '', label: 'Publication date' }
    }
    if (publication?.pdfCreationDate) return { value: publication.pdfCreationDate, label: 'PDF created' }
    return { value: getLatestUploadDate(document), label: 'Uploaded' }
  }
  if (normalizeDocumentType(document.documentType) === 'protocol_sop') {
    if (overrides.revisedDate || overrides.modifiedDate) {
      return { value: overrides.revisedDate || overrides.modifiedDate || '', label: 'Last revised' }
    }
    if (publication?.pdfModificationDate) return { value: publication.pdfModificationDate, label: 'File modified' }
    return { value: document.updatedAt || getLatestUploadDate(document), label: 'Last modified' }
  }
  if (normalizeDocumentType(document.documentType) === 'code') {
    if (overrides.modifiedDate) return { value: overrides.modifiedDate, label: 'Last modified' }
    return { value: document.updatedAt || getLatestUploadDate(document), label: 'Last modified' }
  }
  if (overrides.effectiveDate) return { value: overrides.effectiveDate, label: 'Effective date' }
  if (overrides.createdDate || publication?.pdfCreationDate) {
    return { value: overrides.createdDate || publication?.pdfCreationDate || '', label: 'Created' }
  }
  return { value: document.updatedAt || getLatestUploadDate(document), label: 'Last modified' }
}

const normalizeDocumentRecord = (document: LabDocument): LabDocument => ({
  ...document,
  documentType: normalizeDocumentType(document.documentType),
  tags: Array.isArray(document.tags) ? document.tags : [],
  author: typeof document.author === 'string' ? document.author : '',
  codeMetadata: document.codeMetadata
    ? {
        programmingLanguage: document.codeMetadata.programmingLanguage || '',
        relatedProject: document.codeMetadata.relatedProject || '',
      }
    : undefined,
  versions: Array.isArray(document.versions) ? document.versions : [],
  category: normalizeDocumentType(document.documentType) === 'research_publication'
    ? 'Research Publication'
    : document.category,
})

const buildDiffSegments = (oldText: string, newText: string) =>
  diffWords(oldText, newText).map((part: { value: string; added?: boolean; removed?: boolean }, index: number) => ({
    id: `${part.value}-${index}`,
    value: part.value,
    added: Boolean(part.added),
    removed: Boolean(part.removed),
    unchanged: !part.added && !part.removed,
  }))

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadCloseButtonRef = useRef<HTMLButtonElement | null>(null)
  const uploadReturnFocusRef = useRef<HTMLElement | null>(null)
  const [view, setView] = useState<NavView>('documents')
  const [groups, setGroups] = useState<ResearchGroup[]>([])
  const [documents, setDocuments] = useState<LabDocument[]>([])
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [detailsOpenDocumentId, setDetailsOpenDocumentId] = useState<string | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadMode, setUploadMode] = useState<'document' | 'version'>('document')
  const [versionParentId, setVersionParentId] = useState<string | null>(null)
  const [queue, setQueue] = useState<UploadQueueItem[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSavingUpload, setIsSavingUpload] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadFileName, setUploadFileName] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const [isResizingPanels, setIsResizingPanels] = useState(false)
  const dragDepthRef = useRef(0)
  const panelLayoutRef = useRef<HTMLDivElement | null>(null)
  const [documentListWidth, setDocumentListWidth] = useState(() => {
    try {
      const savedWidth = Number(window.localStorage.getItem('labby-document-list-width'))
      return Number.isFinite(savedWidth) && savedWidth >= 30 && savedWidth <= 70 ? savedWidth : 55
    } catch (error) {
      console.error('Unable to restore document panel width:', error)
      return 55
    }
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDocumentType, setFilterDocumentType] = useState<string>('all')
  const [filterAuthor, setFilterAuthor] = useState('')
  const [dateFilterField, setDateFilterField] = useState<DateFilterField>('publicationDate')
  const [dateStartDraft, setDateStartDraft] = useState('')
  const [dateEndDraft, setDateEndDraft] = useState('')
  const [appliedDateRange, setAppliedDateRange] = useState<{ field: DateFilterField; start: string; end: string } | null>(null)
  const [sortBy, setSortBy] = useState('recently_modified')
  const [listMode, setListMode] = useState<'list' | 'grid'>('list')
  const [compareDocumentId, setCompareDocumentId] = useState<string | null>(null)
  const [compareLeftVersionId, setCompareLeftVersionId] = useState<string | null>(null)
  const [compareRightVersionId, setCompareRightVersionId] = useState<string | null>(null)
  const [compareMode, setCompareMode] = useState<ComparisonMode>('side-by-side')

  useEffect(() => {
    try {
      window.localStorage.setItem('labby-document-list-width', String(documentListWidth))
    } catch (error) {
      console.error('Unable to save document panel width:', error)
    }
  }, [documentListWidth])

  const resizeDocumentPanels = (clientX: number) => {
    const bounds = panelLayoutRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0) return
    const widthPercent = ((clientX - bounds.left) / bounds.width) * 100
    setDocumentListWidth(Math.min(70, Math.max(30, widthPercent)))
  }

  useEffect(() => {
    if (!isResizingPanels) return
    const handleMouseMove = (event: MouseEvent) => resizeDocumentPanels(event.clientX)
    const handleMouseUp = () => setIsResizingPanels(false)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingPanels])

  const selectDocument = (documentId: string) => {
    if (documentId !== selectedDocumentId) setDetailsOpenDocumentId(null)
    setSelectedDocumentId(documentId)
  }

  const openUpload = (mode: 'document' | 'version', parentId?: string) => {
    uploadReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setUploadMode(mode)
    setVersionParentId(parentId || null)
    setQueue([])
    setUploadError('')
    setUploadProgress(null)
    setUploadFileName('')
    dragDepthRef.current = 0
    setIsDraggingFiles(false)
    setUploadOpen(true)
  }

  const closeUpload = () => {
    setUploadOpen(false)
    setUploadMode('document')
    setVersionParentId(null)
    setQueue([])
    setIsAnalyzing(false)
    setIsSavingUpload(false)
    setUploadProgress(null)
    setUploadFileName('')
    dragDepthRef.current = 0
    setIsDraggingFiles(false)
  }

  useEffect(() => {
    if (!uploadOpen) {
      uploadReturnFocusRef.current?.focus()
      uploadReturnFocusRef.current = null
      return
    }

    uploadCloseButtonRef.current?.focus()
  }, [uploadOpen])

  const handleUploadDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeUpload()
      return
    }

    if (event.key !== 'Tab') return
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null)
    const first = focusable[0]
    const last = focusable.at(-1)
    if (!first || !last) return

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const loadInitialData = async () => {
    try {
      const storedGroups = await readStore<ResearchGroup>(GROUP_STORE)
      const storedDocuments = await readStore<LabDocument>(DOCUMENT_STORE)

      const nextGroups = storedGroups.length > 0 ? storedGroups : defaultGroups
      const sourceDocuments = storedDocuments.length > 0 ? storedDocuments : defaultDocuments
      const nextDocuments = sourceDocuments.map(normalizeDocumentRecord)

      setGroups(nextGroups)
      setDocuments(nextDocuments)
      setSelectedDocumentId(nextDocuments[0]?.id || null)
      setSelectedVersionId(nextDocuments[0]?.versions.at(-1)?.id || null)

      if (storedGroups.length === 0) {
        await writeStore(GROUP_STORE, nextGroups)
      }
      if (storedDocuments.length === 0 || JSON.stringify(storedDocuments) !== JSON.stringify(nextDocuments)) {
        await writeStore(DOCUMENT_STORE, nextDocuments)
      }
    } catch (error) {
      console.error('Failed to hydrate Labby data', error)
      setGroups(defaultGroups)
      setDocuments(defaultDocuments)
      setSelectedDocumentId(defaultDocuments[0]?.id || null)
      setSelectedVersionId(defaultDocuments[0]?.versions.at(-1)?.id || null)
    }
  }

  useEffect(() => {
    void loadInitialData()
  }, [])

  useEffect(() => {
    if (documents.length === 0) return
    if (!selectedDocumentId || !documents.some((document) => document.id === selectedDocumentId)) {
      setSelectedDocumentId(documents[0].id)
    }
  }, [documents, selectedDocumentId])

  useEffect(() => {
    if (!selectedDocumentId) return
    const currentDocument = documents.find((document) => document.id === selectedDocumentId)
    const firstVersionId = currentDocument?.versions.at(-1)?.id || null
    if (!selectedVersionId || !currentDocument?.versions.some((version) => version.id === selectedVersionId)) {
      setSelectedVersionId(firstVersionId)
    }
  }, [documents, selectedDocumentId, selectedVersionId])

  const persistData = async (nextGroups: ResearchGroup[], nextDocuments: LabDocument[]) => {
    await writeStore(GROUP_STORE, nextGroups)
    await writeStore(DOCUMENT_STORE, nextDocuments)
    setGroups(nextGroups)
    setDocuments(nextDocuments)
  }

  const authorOptions = useMemo(() => {
    const authors = documents.flatMap((item) => getDocumentAuthors(item))
    return [...new Map(authors.map((author) => [normalizeSearchText(author), author])).values()]
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
  }, [documents])

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      filterAuthor ||
      filterDocumentType !== 'all' ||
      appliedDateRange,
  )

  const clearFilters = () => {
    setSearchQuery('')
    setFilterAuthor('')
    setFilterDocumentType('all')
    setDateStartDraft('')
    setDateEndDraft('')
    setAppliedDateRange(null)
  }

  const filteredDocuments = useMemo(() => {
    const query = searchQuery.trim()
    const normalizedQuery = normalizeSearchText(query)

    const list = documents.filter((document) => {
      const authors = getDocumentAuthors(document)
      const publication = document.publicationMetadata
      const matchesType =
        filterDocumentType === 'all' || normalizeDocumentType(document.documentType) === filterDocumentType
      const matchesAuthor =
        !filterAuthor || authors.some((author) => matchesAuthorQuery(author, filterAuthor))
      const searchableMetadata = [
        document.title,
        document.description,
        document.documentType,
        document.tags.join(' '),
        document.author,
        publication?.journal,
        publication?.doi,
        publication?.keywords,
        publication?.abstract,
        publication?.volume,
        publication?.issue,
        publication?.articleIdentifier,
        ...Object.values(document.dateOverrides || {}),
        document.codeMetadata?.programmingLanguage,
        document.codeMetadata?.relatedProject,
        ...document.versions.flatMap((version) => [
          version.filename,
          version.author,
          version.uploaderName,
          version.changeDescription,
        ]),
      ].filter(Boolean).join(' ')
      const matchesText =
        !normalizedQuery ||
        normalizeSearchText(searchableMetadata).includes(normalizedQuery) ||
        authors.some((author) => matchesAuthorQuery(author, query))

      let matchesDate = true
      if (appliedDateRange) {
        matchesDate = isDateInRange(
          getDateForField(document, appliedDateRange.field),
          appliedDateRange.start,
          appliedDateRange.end,
        )
      }

      return matchesType && matchesAuthor && matchesText && matchesDate
    })

    const compareText = (left: string, right: string) => left.localeCompare(right, undefined, { sensitivity: 'base' })
    const compareDateDescending = (left: LabDocument, right: LabDocument, field: DateFilterField) => {
      const leftDate = parseDateValue(getDateForField(left, field))
      const rightDate = parseDateValue(getDateForField(right, field))
      if (leftDate === null && rightDate === null) return compareText(left.title, right.title)
      if (leftDate === null) return 1
      if (rightDate === null) return -1
      return rightDate - leftDate
    }
    const compareDateAscending = (left: LabDocument, right: LabDocument, field: DateFilterField) => {
      const leftDate = parseDateValue(getDateForField(left, field))
      const rightDate = parseDateValue(getDateForField(right, field))
      if (leftDate === null && rightDate === null) return compareText(left.title, right.title)
      if (leftDate === null) return 1
      if (rightDate === null) return -1
      return leftDate - rightDate
    }

    return [...list].sort((left, right) => {
      if (sortBy === 'title_asc') return compareText(left.title, right.title)
      if (sortBy === 'title_desc') return compareText(right.title, left.title)
      if (sortBy === 'author_asc') return compareText(getFirstAuthor(left), getFirstAuthor(right))
      if (sortBy === 'author_desc') return compareText(getFirstAuthor(right), getFirstAuthor(left))
      if (sortBy === 'newest_publication') return compareDateDescending(left, right, 'publicationDate')
      if (sortBy === 'oldest_publication') return compareDateAscending(left, right, 'publicationDate')
      if (sortBy === 'recently_uploaded') return compareDateDescending(left, right, 'uploadedDate')
      if (sortBy === 'recently_modified') return compareDateDescending(left, right, 'modifiedDate')
      if (sortBy === 'type') return compareText(getDocumentTypeLabel(left.documentType), getDocumentTypeLabel(right.documentType))
      if (sortBy === 'versions') return right.versions.length - left.versions.length
      return compareDateDescending(left, right, 'modifiedDate')
    })
  }, [appliedDateRange, documents, filterAuthor, filterDocumentType, searchQuery, sortBy])

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocumentId) || null,
    [documents, selectedDocumentId],
  )

  const selectedVersion = useMemo(
    () =>
      selectedDocument?.versions.find((version) => version.id === selectedVersionId) ||
      selectedDocument?.versions.at(-1) ||
      null,
    [selectedDocument, selectedVersionId],
  )
  const currentDocumentVersion = useMemo(
    () =>
      selectedDocument?.versions.find((version) => version.id === selectedDocument.currentVersionId) ||
      selectedDocument?.versions.at(-1) ||
      null,
    [selectedDocument],
  )

  const updateDocument = (nextDocument: LabDocument) => {
    const nextDocuments = documents.map((document) =>
      document.id === nextDocument.id
        ? { ...nextDocument, updatedAt: new Date().toISOString() }
        : document,
    )
    void persistData(groups, nextDocuments)
  }

  const updateDateOverride = (field: keyof DocumentDateOverrides, value: string) => {
    if (!selectedDocument) return
    updateDocument({
      ...selectedDocument,
      dateOverrides: { ...selectedDocument.dateOverrides, [field]: value },
    })
  }

  const handleDeleteDocument = (documentId: string) => {
    if (!window.confirm('Delete this document and all versions?')) return

    const nextDocuments = documents.filter((document) => document.id !== documentId)
    setSelectedDocumentId(nextDocuments[0]?.id || null)
    setDetailsOpenDocumentId(null)
    void persistData(groups, nextDocuments)
  }

  const queueFilesForReview = async (files: File[]) => {
    if (files.length === 0 || isAnalyzing || isSavingUpload) return

    setQueue([])
    setUploadError('')
    setIsAnalyzing(true)

    const supportedFiles = files.filter((file) => allowedExtensions.includes(getFileExtension(file.name)))
    const unsupportedFiles = files.filter((file) => !allowedExtensions.includes(getFileExtension(file.name)))

    try {
      const analyzedItems = await Promise.all(
        supportedFiles.map((file) => analyzeUploadedFile(file, documents, groups)),
      )
      setQueue(analyzedItems)
      if (unsupportedFiles.length > 0) {
        setUploadError(`Unsupported file type${unsupportedFiles.length === 1 ? '' : 's'}: ${unsupportedFiles.map((file) => file.name).join(', ')}. Choose a supported document or code file and try again.`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setUploadError(`Could not analyze the selected file${files.length === 1 ? '' : 's'}: ${message}. Try selecting the file again.`)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const saveUploadQueue = async () => {
    if (uploadMode === 'version' && versionParentId) {
      const parentDocument = documents.find((document) => document.id === versionParentId)
      if (!parentDocument) throw new Error('The parent document could not be found.')
      if (queue.length === 0) return

      const item = queue[0]
      const extension = item.file.name.split('.').pop()?.toLowerCase() || 'txt'
      const contentText = item.extractedText || (textPreviewExtensions.includes(extension) ? await item.file.text() : '')
      setUploadFileName(item.file.name)
      const dataUrl = await readFileAsDataUrl(item.file, (progress) => setUploadProgress(progress))
      const savedAt = new Date().toISOString()
      const nextVersion: DocumentVersion = {
        id: crypto.randomUUID(),
        documentId: parentDocument.id,
        versionLabel: `Version ${parentDocument.versions.length + 1}`,
        filename: item.file.name,
        uploadedAt: savedAt,
        author: item.author || parentDocument.author,
        changeDescription: item.description || 'Uploaded a new version of the document.',
        fileType: extension,
        fileSize: item.file.size,
        indexingStatus: 'Pending',
        contentText: contentText || undefined,
        fileDataUrl: dataUrl,
        uploaderId: item.uploaderId || LOCAL_DEVELOPMENT_USER.id,
        uploaderName: item.uploaderName || LOCAL_DEVELOPMENT_USER.name,
      }

      const nextDocuments = documents.map((document) => {
        if (document.id !== parentDocument.id) return document
        const versions = [...document.versions, nextVersion]
        return {
          ...document,
          title: item.title || document.title,
          description: item.description || document.description,
          researchGroupId: item.groupId || document.researchGroupId,
          documentType: item.documentType || document.documentType,
          codeMetadata: item.documentType === 'code' ? item.codeMetadata : document.codeMetadata,
          category: item.category === 'Unclassified' ? document.category || item.category : item.category,
          publicationMetadata: item.category === 'Unclassified'
            ? document.publicationMetadata
            : item.category === 'Research Publication'
              ? item.publicationMetadata
              : undefined,
          dateOverrides: { ...document.dateOverrides, ...item.dateOverrides },
          tags: item.tags.split(',').map((tag) => tag.trim()).filter(Boolean).length
            ? item.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
            : document.tags,
          author: item.author || document.author,
          versions,
          currentVersionId: nextVersion.id,
          updatedAt: savedAt,
        }
      })

      await persistData(groups, nextDocuments)
      closeUpload()
      setSelectedDocumentId(parentDocument.id)
      setSelectedVersionId(nextVersion.id)
      return
    }

    const nextDocuments = [...documents]

    for (const item of queue) {
      const extension = item.file.name.split('.').pop()?.toLowerCase() || 'txt'
      const groupId = item.groupId || item.suggestedGroupId || 'group-uncategorized'
      const contentText = item.extractedText || (textPreviewExtensions.includes(extension) ? await item.file.text() : '')
      setUploadFileName(item.file.name)
      const dataUrl = await readFileAsDataUrl(item.file, (progress) => setUploadProgress(progress))
      const savedAt = new Date().toISOString()

      const documentId = crypto.randomUUID()
      const versionId = crypto.randomUUID()

      const version: DocumentVersion = {
        id: versionId,
        documentId,
        versionLabel: 'Version 1',
        filename: item.file.name,
        uploadedAt: savedAt,
        author: item.author,
        changeDescription: item.description || 'Initial upload',
        fileType: extension,
        fileSize: item.file.size,
        indexingStatus: 'Pending',
        contentText: contentText || undefined,
        fileDataUrl: dataUrl,
        uploaderId: item.uploaderId || LOCAL_DEVELOPMENT_USER.id,
        uploaderName: item.uploaderName || LOCAL_DEVELOPMENT_USER.name,
      }

      const nextDocument: LabDocument = {
        id: documentId,
        title: item.title || item.file.name.replace(/\.[^/.]+$/, ''),
        description: item.description,
        researchGroupId: groupId,
        documentType: item.documentType || 'other',
        tags: item.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        createdAt: savedAt,
        updatedAt: savedAt,
        currentVersionId: versionId,
        author: item.author,
        category: item.category,
        publicationMetadata: item.category === 'Research Publication' ? item.publicationMetadata : undefined,
        codeMetadata: item.documentType === 'code' ? item.codeMetadata : undefined,
        dateOverrides: item.dateOverrides,
        versions: [version],
      }

      nextDocuments.unshift(nextDocument)
    }

    await persistData(groups, nextDocuments)
    closeUpload()
    setSelectedDocumentId(nextDocuments[0]?.id || null)
    setSelectedVersionId(nextDocuments[0]?.versions.at(-1)?.id || null)
  }

  const handleUploadQueue = async () => {
    if (isSavingUpload || isAnalyzing || queue.length === 0) return
    setIsSavingUpload(true)
    setUploadProgress(null)
    setUploadError('')
    try {
      await saveUploadQueue()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setUploadError(`Could not save the selected file: ${message}. Your review is still available; try confirming again.`)
    } finally {
      setIsSavingUpload(false)
      setUploadProgress(null)
      setUploadFileName('')
    }
  }

  const compareDocument = useMemo(
    () => documents.find((document) => document.id === compareDocumentId) || null,
    [compareDocumentId, documents],
  )

  const compareLeftVersion = useMemo(
    () =>
      compareDocument?.versions.find((version) => version.id === compareLeftVersionId) ||
      compareDocument?.versions.at(-2) ||
      compareDocument?.versions.at(0) ||
      null,
    [compareDocument, compareLeftVersionId],
  )

  const compareRightVersion = useMemo(
    () =>
      compareDocument?.versions.find((version) => version.id === compareRightVersionId) ||
      compareDocument?.versions.at(-1) ||
      null,
    [compareDocument, compareRightVersionId],
  )

  const comparisonSummary = useMemo(() => {
    if (!compareLeftVersion || !compareRightVersion) {
      return { additions: 0, deletions: 0 }
    }

    const diff = buildDiffSegments(
      getVersionContent(compareLeftVersion),
      getVersionContent(compareRightVersion),
    )

    return {
      additions: diff.filter((part: { added?: boolean }) => part.added).length,
      deletions: diff.filter((part: { removed?: boolean }) => part.removed).length,
    }
  }, [compareLeftVersion, compareRightVersion])

  const renderDiffText = (leftText: string, rightText: string) => {
    const segments = buildDiffSegments(leftText, rightText)

    return segments.map((segment: { id: string; value: string; added?: boolean; removed?: boolean; unchanged?: boolean }) => {
      const className = segment.added
        ? 'bg-emerald-100 text-emerald-900 rounded px-0.5'
        : segment.removed
          ? 'bg-rose-100 text-rose-900 rounded px-0.5 line-through'
          : 'text-slate-700'

      return (
        <span key={`${segment.id}-${segment.value}`} className={className}>
          {segment.value}
        </span>
      )
    })
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <div className="flex min-h-screen">
        <aside className="w-72 shrink-0 border-r border-slate-200 bg-slate-900 text-slate-100">
          <div className="flex items-center gap-3 border-b border-slate-800 px-6 py-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-semibold">Labby</p>
              <p className="text-xs text-slate-400">Research workspace</p>
            </div>
          </div>

          <nav className="space-y-1 p-4">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                  view === id
                    ? 'bg-slate-800 text-white shadow-inner'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>

        </aside>

        <main className="flex-1 overflow-auto p-7">
          {view === 'documents' && (
            <div className="space-y-6">
              <header className="flex items-center justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Lab documents</p>
                  <h1 className="mt-2 text-3xl font-semibold text-slate-900">Document library</h1>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openUpload('document')}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Documents
                  </button>
                </div>
              </header>

              <div
                ref={panelLayoutRef}
                className={`labby-resizable-panels grid gap-4 xl:h-[calc(100vh-12rem)] xl:min-h-[28rem] xl:gap-0 ${isResizingPanels ? 'select-none' : ''}`}
                style={{ '--document-list-width': `${documentListWidth}%` } as React.CSSProperties}
              >
                <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain">
                  <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="relative w-full max-w-md">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search by title, tags, or author"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none ring-0 transition focus:border-cyan-500 focus:bg-white"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setListMode('list')}
                        className={`rounded-lg px-3 py-2 text-sm ${
                          listMode === 'list' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        List
                      </button>
                      <button
                        type="button"
                        onClick={() => setListMode('grid')}
                        className={`rounded-lg px-3 py-2 text-sm ${
                          listMode === 'grid' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        Grid
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <select
                      value={filterDocumentType}
                      onChange={(event) => setFilterDocumentType(event.target.value)}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"
                      aria-label="Filter by document type"
                    >
                      <option value="all">All document types</option>
                      {documentTypeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>

                    <div className="min-w-[220px] flex-1">
                    <input
                      list="document-author-options"
                      value={filterAuthor}
                      onChange={(event) => setFilterAuthor(event.target.value)}
                      placeholder="Filter by author"
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"
                      aria-label="Filter by author"
                    />
                    <datalist id="document-author-options">
                      {authorOptions.map((author) => <option key={normalizeSearchText(author)} value={author} />)}
                    </datalist>
                    </div>

                    <select
                      value={sortBy}
                      onChange={(event) => setSortBy(event.target.value)}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"
                      aria-label="Sort documents"
                    >
                      <option value="title_asc">Title (A–Z)</option>
                      <option value="title_desc">Title (Z–A)</option>
                      <option value="author_asc">Author (A–Z)</option>
                      <option value="author_desc">Author (Z–A)</option>
                      <option value="newest_publication">Newest Publication Date</option>
                      <option value="oldest_publication">Oldest Publication Date</option>
                      <option value="recently_modified">Recently Modified</option>
                      <option value="recently_uploaded">Recently Uploaded</option>
                      <option value="type">Document Type</option>
                      <option value="versions">Version Count</option>
                    </select>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="min-w-48 flex-1 text-xs font-medium text-slate-600">
                        Date field
                        <select
                          value={dateFilterField}
                          onChange={(event) => setDateFilterField(event.target.value as DateFilterField)}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800"
                        >
                          <option value="publicationDate">Publication Date</option>
                          <option value="createdDate">Created Date</option>
                          <option value="modifiedDate">Last Modified / Revised</option>
                          <option value="uploadedDate">Uploaded Date</option>
                        </select>
                      </label>
                      <label className="text-xs font-medium text-slate-600">
                        From
                        <input
                          type="date"
                          value={dateStartDraft}
                          onChange={(event) => setDateStartDraft(event.target.value)}
                          className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800"
                        />
                      </label>
                      <label className="text-xs font-medium text-slate-600">
                        To
                        <input
                          type="date"
                          value={dateEndDraft}
                          onChange={(event) => setDateEndDraft(event.target.value)}
                          className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (dateStartDraft && dateEndDraft && dateStartDraft > dateEndDraft) {
                            window.alert('The start date must be on or before the end date.')
                            return
                          }
                          setAppliedDateRange(
                            dateStartDraft || dateEndDraft
                              ? { field: dateFilterField, start: dateStartDraft, end: dateEndDraft }
                              : null,
                          )
                        }}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                      >
                        Apply Dates
                      </button>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white"
                        >
                          Clear Filters
                        </button>
                      )}
                      <span className="ml-auto text-sm text-slate-500" aria-live="polite">
                        {filteredDocuments.length} {filteredDocuments.length === 1 ? 'document' : 'documents'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {filteredDocuments.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                        No documents match the current filters.
                      </div>
                    ) : listMode === 'list' ? (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full min-w-[620px] table-fixed divide-y divide-slate-200 text-left text-sm">
                          <thead className="bg-slate-50 text-slate-600">
                            <tr>
                              <th className="w-[40%] px-4 py-3 font-medium">Document</th>
                              <th className="w-[17%] px-4 py-3 font-medium">Type</th>
                              <th className="w-[22%] px-4 py-3 font-medium">Author</th>
                              <th className="w-[15%] px-4 py-3 font-medium">Date</th>
                              <th className="w-[6%] px-4 py-3 font-medium">Version</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                            {filteredDocuments.map((document) => {
                              const latestVersion = document.versions.at(-1)
                              const preferredDate = getPreferredDocumentDate(document)
                              const versionNumber = detectVersionNumber(`${latestVersion?.filename || ''} ${latestVersion?.versionLabel || ''}`)?.version
                              const tableVersion =
                                normalizeDocumentType(document.documentType) === 'research_publication'
                                  ? (latestVersion && detectVersionNumber(latestVersion.filename)?.version ? `V${detectVersionNumber(latestVersion.filename)?.version}` : '—')
                                  : versionNumber
                                    ? `V${versionNumber}`
                                    : '—'
                              return (
                                <tr
                                  key={document.id}
                                  tabIndex={0}
                                  aria-selected={selectedDocumentId === document.id}
                                  onClick={(event) => {
                                    if ((event.target as HTMLElement).closest('button,a,input,select,textarea,[role="button"]')) return
                                    selectDocument(document.id)
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.target !== event.currentTarget) return
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault()
                                      selectDocument(document.id)
                                    }
                                  }}
                                  className={`cursor-pointer transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-cyan-600 ${
                                    selectedDocumentId === document.id ? 'bg-cyan-50 ring-1 ring-inset ring-cyan-300' : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <td className="px-4 py-3">
                                    <span className="whitespace-normal break-words font-semibold leading-5 text-slate-800">
                                      {document.title}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">{getDocumentTypeLabel(document.documentType)}</td>
                                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{getTableAuthor(document)}</td>
                                  <td className="px-4 py-3 text-slate-600">
                                    <span>{formatDocumentDate(preferredDate.value) || '—'}</span>
                                    <span className="mt-0.5 block text-[10px] text-slate-400">{preferredDate.label}</span>
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">{tableVersion}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2">
                        {filteredDocuments.map((document) => {
                          const preferredDate = getPreferredDocumentDate(document)
                          return (
                            <button
                              key={document.id}
                              type="button"
                              onClick={() => selectDocument(document.id)}
                              className={`rounded-2xl border p-4 text-left shadow-sm transition ${
                                selectedDocumentId === document.id
                                  ? 'border-cyan-200 bg-cyan-50'
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="break-words text-base font-semibold text-slate-800">{document.title}</p>
                                  <p className="mt-1 text-xs text-slate-500">{getTableAuthor(document)}</p>
                                </div>
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-slate-600">
                                  {getDocumentTypeLabel(document.documentType)}
                                </span>
                              </div>
                              <div className="mt-5 grid grid-cols-2 gap-2 text-xs text-slate-500">
                                <div>
                                  <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400">{preferredDate.label}</p>
                                  <p className="mt-1 font-medium text-slate-700">{formatDocumentDate(preferredDate.value) || '—'}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400">Versions</p>
                                  <p className="mt-1 font-medium text-slate-700">{document.versions.length}</p>
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </section>

                <div
                  role="separator"
                  aria-label="Resize document panels"
                  aria-orientation="vertical"
                  aria-valuemin={30}
                  aria-valuemax={70}
                  aria-valuenow={Math.round(documentListWidth)}
                  aria-valuetext={`Document list ${Math.round(documentListWidth)} percent, selected document ${Math.round(100 - documentListWidth)} percent`}
                  tabIndex={0}
                  onMouseDown={(event) => {
                    if (event.button !== 0) return
                    event.preventDefault()
                    setIsResizingPanels(true)
                    resizeDocumentPanels(event.clientX)
                  }}
                  onPointerDown={(event) => {
                    if (event.pointerType === 'mouse') return
                    event.preventDefault()
                    event.currentTarget.setPointerCapture(event.pointerId)
                    setIsResizingPanels(true)
                    resizeDocumentPanels(event.clientX)
                  }}
                  onPointerMove={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) resizeDocumentPanels(event.clientX)
                  }}
                  onPointerUp={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId)
                    }
                    setIsResizingPanels(false)
                  }}
                  onPointerCancel={() => setIsResizingPanels(false)}
                  onDoubleClick={() => setDocumentListWidth(55)}
                  onKeyDown={(event) => {
                    if (event.key === 'Home') {
                      event.preventDefault()
                      setDocumentListWidth(55)
                    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                      event.preventDefault()
                      const delta = event.key === 'ArrowRight' ? 2 : -2
                      setDocumentListWidth((width) => Math.min(70, Math.max(30, width + delta)))
                    }
                  }}
                  className="hidden touch-none cursor-col-resize items-center justify-center rounded-full text-slate-300 transition hover:text-cyan-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600 xl:flex"
                  title="Drag to resize panels; double-click to reset"
                >
                  <span className="h-16 w-1 rounded-full bg-current transition-all hover:w-1.5" />
                </div>

                <aside className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:min-h-0 xl:max-h-full xl:overflow-y-auto xl:overscroll-contain">
                  {selectedDocument ? (
                    <div className="space-y-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Selected document</p>
                          <h2 className="mt-2 break-words text-xl font-semibold text-slate-900">{selectedDocument.title}</h2>
                        </div>
                        <button
                          type="button"
                          disabled={!currentDocumentVersion?.fileDataUrl}
                          onClick={async () => {
                            if (!currentDocumentVersion?.fileDataUrl) return
                            try {
                              await downloadVersionFile(currentDocumentVersion)
                            } catch (error) {
                              const message = error instanceof Error ? error.message : String(error)
                              window.alert(`Download failed: ${message}`)
                            }
                          }}
                          className="shrink-0 rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Download Document"
                          title="Download Document"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {getDocumentCategory(selectedDocument)}
                        </span>
                        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                          {getDocumentTypeLabel(selectedDocument.documentType)}
                        </span>
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          {selectedDocument.versions.length} versions
                        </span>
                        {selectedDocument.publicationMetadata?.subtype && (
                          <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-medium text-cyan-800">
                            {selectedDocument.publicationMetadata.subtype}
                          </span>
                        )}
                      </div>

                      <div className="sticky top-0 z-30 -mx-4 flex flex-wrap gap-2 border-y border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
                        <button
                          type="button"
                          aria-expanded={detailsOpenDocumentId === selectedDocument.id}
                          aria-controls="selected-document-details"
                          onClick={() =>
                            setDetailsOpenDocumentId((current) =>
                              current === selectedDocument.id ? null : selectedDocument.id,
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600"
                        >
                          <ChevronRight
                            className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${
                              detailsOpenDocumentId === selectedDocument.id ? 'rotate-90' : ''
                            }`}
                          />
                          Document Details
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCompareDocumentId(selectedDocument.id)
                            setCompareLeftVersionId(selectedDocument.versions.at(-2)?.id || selectedDocument.versions[0]?.id || null)
                            setCompareRightVersionId(selectedDocument.versions.at(-1)?.id || null)
                          }}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Compare Versions
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDocument(selectedDocument.id)}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      </div>

                      <div
                        id="selected-document-details"
                        aria-hidden={detailsOpenDocumentId !== selectedDocument.id}
                        inert={detailsOpenDocumentId !== selectedDocument.id}
                        className="overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out motion-reduce:transition-none"
                        style={{
                          maxHeight: detailsOpenDocumentId === selectedDocument.id ? '10000px' : '0px',
                          opacity: detailsOpenDocumentId === selectedDocument.id ? 1 : 0,
                          visibility: detailsOpenDocumentId === selectedDocument.id ? 'visible' : 'hidden',
                        }}
                      >
                      <div>
                      {getDocumentCategory(selectedDocument) === 'Research Publication' && (
                        <section className="space-y-3 rounded-2xl border border-cyan-100 bg-cyan-50/50 p-3" aria-label="Publication metadata">
                          <h3 className="text-sm font-semibold text-slate-800">Publication metadata</h3>
                          <label className="block text-xs font-medium text-slate-600">
                            Publication subtype
                            <select
                              value={selectedDocument.publicationMetadata?.subtype || ''}
                              onChange={(event) =>
                                updateDocument({
                                  ...selectedDocument,
                                  publicationMetadata: { ...selectedDocument.publicationMetadata!, subtype: event.target.value },
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"
                            >
                              <option value="">Not specified</option>
                              {publicationSubtypes.map((subtype) => <option key={subtype} value={subtype}>{subtype}</option>)}
                            </select>
                          </label>
                          {([
                            ['journal', 'Journal'],
                            ['volume', 'Volume'],
                            ['issue', 'Issue'],
                            ['articleIdentifier', 'Article identifier'],
                            ['doi', 'DOI'],
                            ['keywords', 'Author keywords'],
                          ] as Array<[keyof PublicationMetadata, string]>).map(([field, label]) => (
                            <label key={field} className="block text-xs font-medium text-slate-600">
                              {label}
                              <input
                                value={selectedDocument.publicationMetadata?.[field] || ''}
                                onChange={(event) =>
                                  updateDocument({
                                    ...selectedDocument,
                                    publicationMetadata: {
                                      ...(selectedDocument.publicationMetadata || emptyPublicationMetadata),
                                      [field]: event.target.value,
                                    },
                                  })
                                }
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"
                              />
                            </label>
                          ))}
                          <label className="block text-xs font-medium text-slate-600">
                            Abstract
                            <textarea
                              value={selectedDocument.publicationMetadata?.abstract || ''}
                              onChange={(event) =>
                                updateDocument({
                                  ...selectedDocument,
                                  publicationMetadata: {
                                    ...(selectedDocument.publicationMetadata || emptyPublicationMetadata),
                                    abstract: event.target.value,
                                  },
                                })
                              }
                              rows={4}
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"
                            />
                          </label>
                        </section>
                      )}

                      <div className="rounded-2xl bg-slate-50 p-3">
                        <label htmlFor="selected-document-title" className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                          Title
                        </label>
                        <input
                          id="selected-document-title"
                          value={selectedDocument.title}
                          onChange={(event) =>
                            updateDocument({
                              ...selectedDocument,
                              title: event.target.value,
                              updatedAt: new Date().toISOString(),
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500"
                        />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor="selected-document-type" className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                            Document type
                          </label>
                          <select
                            id="selected-document-type"
                            value={normalizeDocumentType(selectedDocument.documentType)}
                            onChange={(event) =>
                              updateDocument({
                                ...selectedDocument,
                                documentType: event.target.value as DocumentTypeId,
                                category: event.target.value === 'research_publication'
                                  ? 'Research Publication'
                                  : 'Internal Laboratory Document',
                                updatedAt: new Date().toISOString(),
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"
                          >
                            {documentTypeOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="selected-document-description" className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                            Description
                          </label>
                          <textarea
                            id="selected-document-description"
                            value={selectedDocument.description}
                            onChange={(event) =>
                              updateDocument({
                                ...selectedDocument,
                                description: event.target.value,
                                updatedAt: new Date().toISOString(),
                              })
                            }
                            rows={3}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500"
                          />
                        </div>
                        <div>
                          <label htmlFor="selected-document-author" className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                            Author
                          </label>
                          <input
                            id="selected-document-author"
                            value={selectedDocument.author}
                            onChange={(event) =>
                              updateDocument({
                                ...selectedDocument,
                                author: event.target.value,
                                updatedAt: new Date().toISOString(),
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500"
                          />
                          {getDocumentAuthors(selectedDocument).length > 1 && (
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              Full author list: {getDocumentAuthors(selectedDocument).join('; ')}
                            </p>
                          )}
                        </div>
                        <div>
                          <label htmlFor="selected-document-tags" className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                            Tags
                          </label>
                          <input
                            id="selected-document-tags"
                            value={selectedDocument.tags.join(', ')}
                            onChange={(event) =>
                              updateDocument({
                                ...selectedDocument,
                                tags: event.target.value
                                  .split(',')
                                  .map((tag) => tag.trim())
                                  .filter(Boolean),
                                updatedAt: new Date().toISOString(),
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500"
                          />
                        </div>
                      </div>

                      {normalizeDocumentType(selectedDocument.documentType) === 'code' && (
                        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-2" aria-label="Code metadata">
                          <label className="block text-xs font-medium text-slate-600">
                            Programming language
                            <input
                              value={selectedDocument.codeMetadata?.programmingLanguage || ''}
                              onChange={(event) =>
                                updateDocument({
                                  ...selectedDocument,
                                  codeMetadata: {
                                    programmingLanguage: event.target.value,
                                    relatedProject: selectedDocument.codeMetadata?.relatedProject || '',
                                  },
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
                            />
                          </label>
                          <label className="block text-xs font-medium text-slate-600">
                            Related experiment or project
                            <input
                              value={selectedDocument.codeMetadata?.relatedProject || ''}
                              onChange={(event) =>
                                updateDocument({
                                  ...selectedDocument,
                                  codeMetadata: {
                                    programmingLanguage: selectedDocument.codeMetadata?.programmingLanguage || '',
                                    relatedProject: event.target.value,
                                  },
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
                            />
                          </label>
                          <label className="block text-xs font-medium text-slate-600">
                            Current version
                            <input
                              value={selectedVersion?.versionLabel || ''}
                              readOnly
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-600"
                            />
                          </label>
                        </section>
                      )}

                      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3" aria-label="Document dates">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-800">Document dates</h3>
                          <p className="mt-1 text-xs text-slate-500">Manual corrections are stored separately from extracted PDF dates.</p>
                        </div>
                        {getDocumentCategory(selectedDocument) === 'Research Publication' && (
                          <div>
                            <label className="block text-xs font-medium text-slate-600">
                              Publication date
                              <input
                                value={selectedDocument.dateOverrides?.publicationDate || selectedDocument.publicationMetadata?.publicationDate || ''}
                                onChange={(event) => updateDateOverride('publicationDate', event.target.value)}
                                placeholder="e.g. Jan 2025"
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
                              />
                            </label>
                            {selectedDocument.publicationMetadata?.publicationDate && (
                              <p className="mt-1 text-[11px] text-slate-400">
                                Extracted: {selectedDocument.publicationMetadata.publicationDate}
                              </p>
                            )}
                          </div>
                        )}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-xs font-medium text-slate-600">
                            {getDocumentCategory(selectedDocument) === 'Research Publication' ? 'Original file creation date' : 'Document creation date'}
                            <input
                              value={selectedDocument.dateOverrides?.createdDate || selectedDocument.publicationMetadata?.pdfCreationDate || ''}
                              onChange={(event) => updateDateOverride('createdDate', event.target.value)}
                              placeholder="e.g. Jan 6, 2025"
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
                            />
                          </label>
                          <label className="block text-xs font-medium text-slate-600">
                            {getDocumentCategory(selectedDocument) === 'Research Publication'
                              ? 'Original file modification date'
                              : normalizeDocumentType(selectedDocument.documentType) === 'code'
                                ? 'Last modified date'
                                : 'Last revised date'}
                            <input
                              value={selectedDocument.dateOverrides?.modifiedDate || selectedDocument.dateOverrides?.revisedDate || selectedDocument.publicationMetadata?.pdfModificationDate || ''}
                              onChange={(event) => updateDateOverride(
                                getDocumentCategory(selectedDocument) === 'Research Publication' ||
                                  normalizeDocumentType(selectedDocument.documentType) === 'code'
                                  ? 'modifiedDate'
                                  : 'revisedDate',
                                event.target.value,
                              )}
                              placeholder="e.g. Jan 6, 2025"
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
                            />
                          </label>
                          {getDocumentCategory(selectedDocument) !== 'Research Publication' && (
                            <label className="block text-xs font-medium text-slate-600">
                              Effective date
                              <input
                                value={selectedDocument.dateOverrides?.effectiveDate || ''}
                                onChange={(event) => updateDateOverride('effectiveDate', event.target.value)}
                                placeholder="Optional"
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
                              />
                            </label>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          Labby upload timestamp: {selectedVersion ? formatDate(selectedVersion.uploadedAt) : 'Not available'}
                        </p>
                      </section>

                      {selectedVersion && (
                        <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                          <p><span className="font-medium text-slate-700">Original filename:</span> {selectedVersion.filename}</p>
                          <p className="mt-1"><span className="font-medium text-slate-700">Uploaded by:</span> {selectedVersion.uploaderName || 'Unknown user'}</p>
                          <p className="mt-1"><span className="font-medium text-slate-700">Uploaded at:</span> {new Date(selectedVersion.uploadedAt).toLocaleString()}</p>
                        </div>
                      )}
                      </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-800">Version history</p>
                          <button
                            type="button"
                            onClick={() => openUpload('version', selectedDocument.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                          >
                            <Upload className="h-3 w-3" />
                            Upload new version
                          </button>
                        </div>
                        <div className="space-y-2">
                          {[...selectedDocument.versions].reverse().map((version) => (
                            <button
                              key={version.id}
                              type="button"
                              onClick={() => setSelectedVersionId(version.id)}
                              className={`flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left transition ${
                                selectedVersionId === version.id
                                  ? 'border-cyan-200 bg-cyan-50'
                                  : 'border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <div>
                                <p className="font-medium text-slate-800">{version.versionLabel}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {formatDate(version.uploadedAt)} · {version.author}
                                </p>
                              </div>
                              <ChevronRight className="mt-0.5 h-4 w-4 text-slate-400" />
                            </button>
                          ))}
                        </div>
                      </div>

                      {selectedVersion && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Selected version</p>
                              <h3 className="mt-1 text-lg font-semibold text-slate-800">
                                {selectedVersion.versionLabel}
                              </h3>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (selectedVersion.fileDataUrl) {
                                    const anchor = document.createElement('a')
                                    anchor.href = selectedVersion.fileDataUrl
                                    anchor.download = selectedVersion.filename
                                    anchor.click()
                                  }
                                }}
                                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white"
                              >
                                <Download className="mr-1 inline h-3 w-3" />
                                Download
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                            <div>
                              <p className="text-slate-400">Author</p>
                              <p className="font-medium text-slate-800">{selectedVersion.author}</p>
                            </div>
                            <div>
                              <p className="text-slate-400">Upload date</p>
                              <p className="font-medium text-slate-800">{formatDate(selectedVersion.uploadedAt)}</p>
                            </div>
                            <div>
                              <p className="text-slate-400">File type</p>
                              <p className="font-medium text-slate-800">{selectedVersion.fileType}</p>
                            </div>
                            <div>
                              <p className="text-slate-400">Size</p>
                              <p className="font-medium text-slate-800">{formatBytes(selectedVersion.fileSize)}</p>
                            </div>
                          </div>

                          <p className="mt-3 text-sm text-slate-600">{selectedVersion.changeDescription}</p>

                          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                            <span className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Preview</span>
                            {textPreviewExtensions.includes(selectedVersion.fileType) ? (
                              <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-700">
                                {getVersionContent(selectedVersion)}
                              </pre>
                            ) : (
                              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                                {selectedVersion.fileType.toUpperCase()} preview is not supported in this prototype. Download to review the original file.
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-slate-500">Select a document to review its metadata and versions.</div>
                  )}
                </aside>
              </div>
            </div>
          )}

          {view === 'search' && (
            <div className="space-y-6">
              <header className="border-b border-slate-200 pb-5">
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Search</p>
                <h1 className="mt-2 text-3xl font-semibold text-slate-900">Document search</h1>
              </header>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="relative max-w-xl">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-cyan-500"
                    placeholder="Search Labby documents"
                  />
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredDocuments.map((document) => (
                    <button
                      key={document.id}
                      type="button"
                      onClick={() => {
                        selectDocument(document.id)
                        setView('documents')
                      }}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-cyan-200"
                    >
                      <p className="font-medium text-slate-800">{document.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{document.author}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {view === 'settings' && (
            <div className="space-y-6">
              <header className="border-b border-slate-200 pb-5">
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Settings</p>
                <h1 className="mt-2 text-3xl font-semibold text-slate-900">Lab configuration</h1>
              </header>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <Database className="h-5 w-5 text-cyan-600" />
                    <h2 className="text-lg font-semibold text-slate-800">Local storage</h2>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    IndexedDB is used for demo persistence in this prototype. Uploaded file contents remain local to the browser only.
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-dialog-title"
            onKeyDown={handleUploadDialogKeyDown}
            className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Upload</p>
                <h2 id="upload-dialog-title" className="mt-1 text-2xl font-semibold text-slate-900">
                  {uploadMode === 'version' ? 'Upload a new version' : 'Add laboratory documents'}
                </h2>
              </div>
              <button
                ref={uploadCloseButtonRef}
                type="button"
                aria-label="Close upload dialog"
                onClick={closeUpload}
                disabled={isSavingUpload}
                className="rounded-lg bg-slate-100 p-2 text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <div
                  onDragEnter={(event) => {
                    event.preventDefault()
                    if (isAnalyzing || isSavingUpload || !Array.from(event.dataTransfer.types).includes('Files')) return
                    dragDepthRef.current += 1
                    setIsDraggingFiles(true)
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    if (!isAnalyzing && !isSavingUpload && Array.from(event.dataTransfer.types).includes('Files')) {
                      event.dataTransfer.dropEffect = 'copy'
                    }
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault()
                    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
                    if (dragDepthRef.current === 0) setIsDraggingFiles(false)
                  }}
                  onDrop={async (event) => {
                    event.preventDefault()
                    dragDepthRef.current = 0
                    setIsDraggingFiles(false)
                    const fileList = Array.from(event.dataTransfer.files)
                    void queueFilesForReview(fileList)
                  }}
                  aria-busy={isAnalyzing || isSavingUpload}
                  className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors duration-150 ${
                    isDraggingFiles
                      ? 'scale-[1.01] border-cyan-500 bg-cyan-100'
                      : 'border-cyan-200 bg-cyan-50'
                  } ${isAnalyzing || isSavingUpload ? 'pointer-events-none opacity-70' : ''}`}
                >
                  <Upload className={`mx-auto h-10 w-10 transition-colors ${isDraggingFiles ? 'text-cyan-800' : 'text-cyan-600'}`} />
                  <p className="mt-3 text-lg font-semibold text-slate-800">
                    {isDraggingFiles ? 'Drop files to upload' : 'Drop files here'}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    PDF, DOCX, TXT, CSV, XLSX, PPTX, and code files ({codeExtensions.map((extension) => `.${extension}`).join(', ')})
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isAnalyzing || isSavingUpload}
                    className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    Browse files
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={allowedExtensions.map((extension) => `.${extension}`).join(',')}
                    className="hidden"
                    disabled={isAnalyzing || isSavingUpload}
                    onChange={(event) => {
                      const files = Array.from(event.target.files || [])
                      void queueFilesForReview(files)
                      event.target.value = ''
                    }}
                  />
                </div>

                {isAnalyzing && (
                  <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-800">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300 border-t-cyan-800 motion-reduce:animate-none" aria-hidden="true" />
                    <span>Extracting document information...</span>
                  </div>
                )}

                {isSavingUpload && (
                  <div role="status" aria-live="polite" className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-800">
                    <div className="flex items-center gap-3">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300 border-t-cyan-800 motion-reduce:animate-none" aria-hidden="true" />
                      <span>
                        Saving {uploadFileName || 'selected file'} locally
                        {uploadProgress !== null ? ` — ${Math.round(uploadProgress * 100)}%` : '…'}
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={uploadProgress === null ? 'Saving file progress' : 'File read progress'}
                      aria-valuemin={uploadProgress === null ? undefined : 0}
                      aria-valuemax={uploadProgress === null ? undefined : 100}
                      aria-valuenow={uploadProgress === null ? undefined : Math.round(uploadProgress * 100)}
                      className="mt-3 h-1.5 overflow-hidden rounded-full bg-cyan-100"
                    >
                      <div
                        className={`h-full rounded-full bg-cyan-700 ${
                          uploadProgress === null ? 'w-1/3 animate-pulse motion-reduce:animate-none' : ''
                        }`}
                        style={uploadProgress === null ? undefined : { width: `${Math.round(uploadProgress * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {uploadError && (
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                    <span>{uploadError}</span>
                    {!isSavingUpload && !isAnalyzing && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-100"
                      >
                        Try again
                      </button>
                    )}
                  </div>
                )}

                {!isAnalyzing && !isSavingUpload && queue.length > 0 && (
                  <div role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                    File information is ready for review. Uploaded files remain in this browser.
                  </div>
                )}

                <div className="space-y-3">
                  {queue.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                      No files selected yet.
                    </div>
                  ) : (
                    queue.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-200 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-800">{item.file.name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {item.file.type || 'Unknown type'} · {formatBytes(item.file.size)} · Uploaded by {item.uploaderName}
                            </p>
                            <p className="mt-1 text-xs font-medium text-cyan-700">
                              {item.category} · Extraction: {item.extractionStatus}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label={`Remove ${item.file.name}`}
                            onClick={() => setQueue((current) => current.filter((row) => row.id !== item.id))}
                            className="rounded-lg bg-slate-100 p-2 text-slate-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>

                        {item.warnings.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {item.warnings.map((warning) => (
                              <div
                                key={`${item.id}-${warning.message}`}
                                className={
                                  warning.level === 'error'
                                    ? 'rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700'
                                    : warning.level === 'warning'
                                      ? 'rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700'
                                      : 'rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-700'
                                }
                              >
                                {warning.message}
                              </div>
                            ))}
                            {(item.extractionStatus === 'failed' || item.extractionStatus === 'unsupported') && (
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50"
                              >
                                Retry file selection
                              </button>
                            )}
                          </div>
                        )}

                        {item.extractionDiagnostics.length > 0 && (
                          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500" aria-label="Extraction diagnostics">
                            {item.extractionDiagnostics.map((diagnostic) => (
                              <li key={`${item.id}-${diagnostic}`}>{diagnostic}</li>
                            ))}
                          </ul>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.extracted.slice(0, 3).map((suggestion) => (
                            <span
                              key={`${item.id}-${suggestion.field}`}
                              className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-600"
                            >
                              {suggestion.field}: {suggestion.value}
                            </span>
                          ))}
                        </div>

                        {item.relatedDocument && (
                          <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700">
                            Possible existing document match: <span className="font-semibold">{item.relatedDocument}</span>
                          </div>
                        )}

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <input
                            value={item.title}
                            onChange={(event) =>
                              setQueue((current) =>
                                current.map((row) =>
                                  row.id === item.id ? { ...row, title: event.target.value } : row,
                                ),
                              )
                            }
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500"
                            aria-label="Document title"
                            placeholder="Document title"
                          />
                          <input
                            value={item.author}
                            onChange={(event) =>
                              setQueue((current) =>
                                current.map((row) =>
                                  row.id === item.id ? { ...row, author: event.target.value } : row,
                                ),
                              )
                            }
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500"
                            aria-label={item.category === 'Research Publication' ? 'Publication authors' : 'Document author'}
                            placeholder={item.category === 'Research Publication' ? 'Publication authors' : 'Document author'}
                          />
                          <select
                            value={item.documentType}
                            onChange={(event) =>
                              setQueue((current) =>
                                current.map((row) =>
                                  row.id === item.id
                                    ? {
                                        ...row,
                                        documentType: event.target.value as DocumentTypeId,
                                        category: event.target.value === 'research_publication'
                                          ? 'Research Publication'
                                          : 'Internal Laboratory Document',
                                      }
                                    : row,
                                ),
                              )
                            }
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                            aria-label="Document type"
                          >
                            {documentTypeOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          {item.documentType === 'code' && (
                            <>
                              <input
                                value={item.codeMetadata.programmingLanguage}
                                onChange={(event) =>
                                  setQueue((current) =>
                                    current.map((row) =>
                                      row.id === item.id
                                        ? { ...row, codeMetadata: { ...row.codeMetadata, programmingLanguage: event.target.value } }
                                        : row,
                                    ),
                                  )
                                }
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                                aria-label="Programming language"
                                placeholder="Programming language"
                              />
                              <input
                                value={item.codeMetadata.relatedProject}
                                onChange={(event) =>
                                  setQueue((current) =>
                                    current.map((row) =>
                                      row.id === item.id
                                        ? { ...row, codeMetadata: { ...row.codeMetadata, relatedProject: event.target.value } }
                                        : row,
                                    ),
                                  )
                                }
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                                aria-label="Related experiment or project"
                                placeholder="Related experiment or project"
                              />
                            </>
                          )}
                          <textarea
                            value={item.description}
                            onChange={(event) =>
                              setQueue((current) =>
                                current.map((row) =>
                                  row.id === item.id ? { ...row, description: event.target.value } : row,
                                ),
                              )
                            }
                            rows={2}
                            className="sm:col-span-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500"
                            aria-label="Description"
                            placeholder="Description"
                          />
                          <input
                            value={item.tags}
                            onChange={(event) =>
                              setQueue((current) =>
                                current.map((row) =>
                                  row.id === item.id ? { ...row, tags: event.target.value } : row,
                                ),
                              )
                            }
                            className="sm:col-span-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500"
                            aria-label="Tags"
                            placeholder="Tags, comma separated"
                          />
                          {item.category === 'Research Publication' && (
                            <div className="sm:col-span-2 rounded-xl border border-cyan-100 bg-cyan-50/50 p-3">
                              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-800">
                                Publication metadata
                              </p>
                              <label className="mb-3 block text-xs font-medium text-slate-600">
                                Publication subtype
                                <select
                                  value={item.publicationMetadata.subtype || ''}
                                  onChange={(event) =>
                                    setQueue((current) =>
                                      current.map((row) =>
                                        row.id === item.id
                                          ? { ...row, publicationMetadata: { ...row.publicationMetadata, subtype: event.target.value } }
                                          : row,
                                      ),
                                    )
                                  }
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"
                                >
                                  <option value="">Not specified</option>
                                  {publicationSubtypes.map((subtype) => <option key={subtype} value={subtype}>{subtype}</option>)}
                                </select>
                              </label>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {([
                                  ['journal', 'Journal'],
                                  ['volume', 'Volume'],
                                  ['issue', 'Issue'],
                                  ['articleIdentifier', 'Article identifier'],
                                  ['doi', 'DOI'],
                                  ['keywords', 'Author keywords'],
                                ] as Array<[keyof PublicationMetadata, string]>).map(([field, label]) => (
                                  <label key={field} className="block text-xs font-medium text-slate-600">
                                    {label}
                                    <input
                                      value={item.publicationMetadata[field]}
                                      onChange={(event) =>
                                        setQueue((current) =>
                                          current.map((row) =>
                                            row.id === item.id
                                              ? { ...row, publicationMetadata: { ...row.publicationMetadata, [field]: event.target.value } }
                                              : row,
                                          ),
                                        )
                                      }
                                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-cyan-500"
                                    />
                                  </label>
                                ))}
                                {([
                                  ['publicationDate', 'Publication date'],
                                  ['createdDate', 'PDF creation date'],
                                  ['modifiedDate', 'PDF modification date'],
                                ] as Array<[keyof DocumentDateOverrides, string]>).map(([field, label]) => {
                                  const original = field === 'publicationDate'
                                    ? item.publicationMetadata.publicationDate
                                    : field === 'createdDate'
                                      ? item.publicationMetadata.pdfCreationDate
                                      : item.publicationMetadata.pdfModificationDate
                                  return (
                                    <label key={field} className="block text-xs font-medium text-slate-600">
                                      {label}
                                      <input
                                        value={item.dateOverrides[field] || original}
                                        onChange={(event) =>
                                          setQueue((current) =>
                                            current.map((row) =>
                                              row.id === item.id
                                                ? { ...row, dateOverrides: { ...row.dateOverrides, [field]: event.target.value } }
                                                : row,
                                            ),
                                          )
                                        }
                                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-cyan-500"
                                      />
                                      {original && <span className="mt-1 block font-normal text-slate-400">Extracted: {original}</span>}
                                    </label>
                                  )
                                })}
                                <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                                  Abstract
                                  <textarea
                                    value={item.publicationMetadata.abstract}
                                    onChange={(event) =>
                                      setQueue((current) =>
                                        current.map((row) =>
                                          row.id === item.id
                                            ? { ...row, publicationMetadata: { ...row.publicationMetadata, abstract: event.target.value } }
                                            : row,
                                        ),
                                      )
                                    }
                                    rows={5}
                                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-cyan-500"
                                  />
                                </label>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Extraction summary</p>
                          <div className="mt-2 space-y-2">
                            {item.extracted.map((suggestion) => (
                              <div key={`${item.id}-extract-${suggestion.field}`} className="flex items-start justify-between gap-3 rounded-lg bg-white px-2.5 py-2 text-xs text-slate-600">
                                <div>
                                  <span className="font-medium text-slate-800">{suggestion.field}</span>
                                  <p className="mt-0.5">{suggestion.value}</p>
                                </div>
                                <div className="text-right">
                                  <div className="font-medium text-slate-700">{suggestion.source}</div>
                                  <div className="text-[10px] text-slate-500">{suggestion.confidence}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Deterministic local extraction is active. No document content leaves the browser.
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Uploader identity</p>
                  <div className="mt-2 text-sm text-slate-700">
                    <span className="font-medium text-slate-800">{LOCAL_DEVELOPMENT_USER.name}</span>
                    <span className="ml-2 text-slate-500">({LOCAL_DEVELOPMENT_USER.id})</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Upload time is recorded when you confirm.</p>
                </div>

                {uploadMode === 'version' && versionParentId && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                    Parent document: <span className="font-medium text-slate-800">{documents.find((document) => document.id === versionParentId)?.title}</span>
                  </div>
                )}

              </div>
            </div>
            </div>
            <div className="sticky bottom-0 flex shrink-0 gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={closeUpload}
                disabled={isSavingUpload}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isAnalyzing || isSavingUpload || queue.length === 0}
                onClick={() => {
                  if (queue.length === 0) return
                  void handleUploadQueue()
                }}
                className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSavingUpload
                  ? 'Saving locally…'
                  : uploadMode === 'version'
                    ? 'Confirm new version'
                    : 'Confirm upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {compareDocument && compareLeftVersion && compareRightVersion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-5">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Version comparison</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">{compareDocument.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCompareDocumentId(null)
                  setCompareLeftVersionId(null)
                  setCompareRightVersionId(null)
                }}
                className="rounded-lg bg-slate-100 p-2 text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 p-3">
                <select
                  value={compareLeftVersion.id}
                  onChange={(event) => setCompareLeftVersionId(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                >
                  {compareDocument.versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.versionLabel}
                    </option>
                  ))}
                </select>
                <ArrowRightLeft className="h-4 w-4 text-slate-400" />
                <select
                  value={compareRightVersion.id}
                  onChange={(event) => setCompareRightVersionId(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                >
                  {compareDocument.versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.versionLabel}
                    </option>
                  ))}
                </select>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCompareMode('side-by-side')}
                    className={`rounded-xl px-3 py-2 text-sm ${
                      compareMode === 'side-by-side' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    Side-by-side
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareMode('unified')}
                    className={`rounded-xl px-3 py-2 text-sm ${
                      compareMode === 'unified' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    Unified
                  </button>
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600 sm:grid-cols-4">
                <div>
                  <p className="text-slate-400">Left version</p>
                  <p className="mt-1 font-medium text-slate-800">{compareLeftVersion.versionLabel}</p>
                </div>
                <div>
                  <p className="text-slate-400">Right version</p>
                  <p className="mt-1 font-medium text-slate-800">{compareRightVersion.versionLabel}</p>
                </div>
                <div>
                  <p className="text-slate-400">Additions</p>
                  <p className="mt-1 font-medium text-slate-800">{comparisonSummary.additions}</p>
                </div>
                <div>
                  <p className="text-slate-400">Deletions</p>
                  <p className="mt-1 font-medium text-slate-800">{comparisonSummary.deletions}</p>
                </div>
              </div>

              {compareMode === 'side-by-side' ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Older version</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-800">{compareLeftVersion.versionLabel}</h3>
                      </div>
                      <span className="text-xs text-slate-500">{formatDate(compareLeftVersion.uploadedAt)}</span>
                    </div>
                    <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-700">
                      {renderDiffText(
                        getVersionContent(compareLeftVersion),
                        getVersionContent(compareRightVersion),
                      )}
                    </pre>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Newer version</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-800">{compareRightVersion.versionLabel}</h3>
                      </div>
                      <span className="text-xs text-slate-500">{formatDate(compareRightVersion.uploadedAt)}</span>
                    </div>
                    <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-700">
                      {renderDiffText(
                        getVersionContent(compareRightVersion),
                        getVersionContent(compareLeftVersion),
                      )}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Unified changes</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-800">
                        {compareLeftVersion.versionLabel} → {compareRightVersion.versionLabel}
                      </h3>
                    </div>
                  </div>
                  <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-700">
                    {renderDiffText(
                      getVersionContent(compareLeftVersion),
                      getVersionContent(compareRightVersion),
                    )}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
