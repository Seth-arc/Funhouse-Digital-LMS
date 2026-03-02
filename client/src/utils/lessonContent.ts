export interface LessonStoryCard {
  title: string;
  body: string;
  imageUrl: string;
  imageAlt: string;
  linkLabel: string;
  linkUrl: string;
}

export interface LessonContentData {
  richContentHtml: string;
  overview: string;
  heroImageUrl: string;
  heroImageAlt: string;
  goals: string[];
  checklist: string[];
  stationGuidance: [string, string, string];
  storyCards: [LessonStoryCard, LessonStoryCard, LessonStoryCard];
}

export const createEmptyLessonContent = (): LessonContentData => ({
  richContentHtml: '',
  overview: '',
  heroImageUrl: '',
  heroImageAlt: '',
  goals: ['', '', ''],
  checklist: ['', '', ''],
  stationGuidance: ['', '', ''],
  storyCards: [createEmptyStoryCard(), createEmptyStoryCard(), createEmptyStoryCard()],
});

export const parseLessonContentJson = (raw?: string | null): LessonContentData | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LessonContentData>;
    return {
      richContentHtml: sanitizeLessonHtml(typeof parsed.richContentHtml === 'string' ? parsed.richContentHtml : ''),
      overview: typeof parsed.overview === 'string' ? parsed.overview : '',
      heroImageUrl: typeof parsed.heroImageUrl === 'string' ? parsed.heroImageUrl.trim() : '',
      heroImageAlt: typeof parsed.heroImageAlt === 'string' ? parsed.heroImageAlt.trim() : '',
      goals: normalizeStringArray(parsed.goals, 3),
      checklist: normalizeStringArray(parsed.checklist, 3),
      stationGuidance: normalizeStationGuidance(parsed.stationGuidance),
      storyCards: normalizeStoryCards(parsed.storyCards),
    };
  } catch {
    return null;
  }
};

export const serializeLessonContentJson = (content: LessonContentData): string | null => {
  const normalized: LessonContentData = {
    richContentHtml: sanitizeLessonHtml(content.richContentHtml).trim(),
    overview: content.overview.trim(),
    heroImageUrl: content.heroImageUrl.trim(),
    heroImageAlt: content.heroImageAlt.trim(),
    goals: normalizeStringArray(content.goals, 3),
    checklist: normalizeStringArray(content.checklist, 3),
    stationGuidance: normalizeStationGuidance(content.stationGuidance),
    storyCards: normalizeStoryCards(content.storyCards),
  };

  const hasContent =
    normalized.richContentHtml ||
    normalized.overview ||
    normalized.heroImageUrl ||
    normalized.goals.some(Boolean) ||
    normalized.checklist.some(Boolean) ||
    normalized.stationGuidance.some(Boolean) ||
    normalized.storyCards.some(card => card.title || card.body || card.imageUrl || card.linkLabel || card.linkUrl);

  if (!hasContent) return null;
  return JSON.stringify(normalized);
};

export const createLessonHtmlFromLegacyContent = (content: LessonContentData): string => {
  if (content.richContentHtml.trim()) {
    return sanitizeLessonHtml(content.richContentHtml);
  }

  const sections: string[] = [];
  const overview = content.overview.trim();
  const goals = content.goals.map(item => item.trim()).filter(Boolean);
  const checklist = content.checklist.map(item => item.trim()).filter(Boolean);
  const stationGuidance = content.stationGuidance.map(item => item.trim());
  const storyCards = content.storyCards.filter(card =>
    card.title.trim() || card.body.trim() || card.imageUrl.trim() || card.linkLabel.trim() || card.linkUrl.trim()
  );

  if (overview) {
    sections.push('<h2>Lesson Overview</h2>');
    sections.push(toParagraphsHtml(overview));
  }

  if (content.heroImageUrl.trim()) {
    const heroUrl = normalizeSafeUrl(content.heroImageUrl);
    if (heroUrl) {
      const heroAlt = escapeHtml(content.heroImageAlt.trim() || 'Lesson image');
      sections.push(`<p><img src="${heroUrl}" alt="${heroAlt}" /></p>`);
    }
  }

  if (storyCards.length > 0) {
    sections.push('<h2>Lesson Highlights</h2>');
    for (const card of storyCards) {
      const storyParts: string[] = [];
      if (card.title.trim()) storyParts.push(`<h3>${escapeHtml(card.title.trim())}</h3>`);
      if (card.body.trim()) storyParts.push(toParagraphsHtml(card.body.trim()));

      const cardImageUrl = normalizeSafeUrl(card.imageUrl);
      if (cardImageUrl) {
        const cardImageAlt = escapeHtml(card.imageAlt.trim() || card.title.trim() || 'Lesson highlight image');
        storyParts.push(`<p><img src="${cardImageUrl}" alt="${cardImageAlt}" /></p>`);
      }

      const linkUrl = normalizeSafeUrl(card.linkUrl, false, true);
      if (linkUrl) {
        const linkLabel = escapeHtml(card.linkLabel.trim() || 'Learn more');
        storyParts.push(`<p><a href="${linkUrl}" target="_blank" rel="noopener noreferrer">${linkLabel}</a></p>`);
      }

      if (storyParts.length > 0) {
        sections.push(storyParts.join(''));
      }
    }
  }

  if (goals.length > 0) {
    sections.push('<h2>Learning Goals</h2>');
    sections.push(toListHtml(goals));
  }

  if (checklist.length > 0) {
    sections.push('<h2>Checklist</h2>');
    sections.push(toListHtml(checklist));
  }

  if (stationGuidance.some(Boolean)) {
    sections.push('<h2>Station Guidance</h2>');
    stationGuidance.forEach((item, index) => {
      if (!item) return;
      sections.push(`<h3>Station ${index + 1}</h3>`);
      sections.push(toParagraphsHtml(item));
    });
  }

  return sanitizeLessonHtml(sections.join(''));
};

const normalizeStringArray = (value: unknown, minSize: number): string[] => {
  const list = Array.isArray(value)
    ? value.map(item => (typeof item === 'string' ? item : ''))
    : [];
  while (list.length < minSize) list.push('');
  return list.slice(0, Math.max(minSize, list.length)).map(item => item.trim());
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeSafeUrl = (value: string, allowDataImage = false, allowMailto = false): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();
  const isHttp = lower.startsWith('http://') || lower.startsWith('https://');
  const isMailto = allowMailto && lower.startsWith('mailto:');
  const isDataImage = allowDataImage && lower.startsWith('data:image/');
  if (!isHttp && !isMailto && !isDataImage) return '';

  return escapeHtml(trimmed);
};

const toParagraphsHtml = (value: string): string => {
  const paragraphs = value
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return '';
  return paragraphs.map(part => `<p>${escapeHtml(part)}</p>`).join('');
};

const toListHtml = (items: string[]): string =>
  `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;

const normalizeStationGuidance = (value: unknown): [string, string, string] => {
  const list = normalizeStringArray(value, 3).slice(0, 3) as [string, string, string];
  return list;
};

const createEmptyStoryCard = (): LessonStoryCard => ({
  title: '',
  body: '',
  imageUrl: '',
  imageAlt: '',
  linkLabel: '',
  linkUrl: '',
});

const normalizeStoryCards = (
  value: unknown
): [LessonStoryCard, LessonStoryCard, LessonStoryCard] => {
  const input = Array.isArray(value) ? value : [];
  const cards: LessonStoryCard[] = input.map((item) => {
    if (!item || typeof item !== 'object') return createEmptyStoryCard();
    const entry = item as Partial<LessonStoryCard>;
    return {
      title: typeof entry.title === 'string' ? entry.title.trim() : '',
      body: typeof entry.body === 'string' ? entry.body.trim() : '',
      imageUrl: typeof entry.imageUrl === 'string' ? entry.imageUrl.trim() : '',
      imageAlt: typeof entry.imageAlt === 'string' ? entry.imageAlt.trim() : '',
      linkLabel: typeof entry.linkLabel === 'string' ? entry.linkLabel.trim() : '',
      linkUrl: typeof entry.linkUrl === 'string' ? entry.linkUrl.trim() : '',
    };
  });
  while (cards.length < 3) cards.push(createEmptyStoryCard());
  return cards.slice(0, 3) as [LessonStoryCard, LessonStoryCard, LessonStoryCard];
};

export const sanitizeLessonHtml = (value: string): string => {
  if (!value) return '';
  let sanitized = value;

  sanitized = sanitized
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s(href|src)\s*=\s*"javascript:[^"]*"/gi, '')
    .replace(/\s(href|src)\s*=\s*'javascript:[^']*'/gi, '');

  return sanitized.trim();
};
