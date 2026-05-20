const fs = require("fs");
const path = require("path");

const PROFILE_VIEWS_MIN = Number(process.env.PROFILE_VIEWS_MIN || 100);
const MIN_VISIBLE_RANK = process.env.MIN_VISIBLE_RANK || "B";
const RANK_ORDER = ["C", "C+", "B-", "B", "B+", "A-", "A", "A+", "S"];

const repoRoot = process.cwd();
const readmePath = path.join(repoRoot, "README.md");
const statsPath = path.join(repoRoot, "profile", "stats.svg");
const viewsPath = path.join(repoRoot, "profile", "views.svg");

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseHumanNumber(value) {
  const normalized = value.replace(/,/g, "").trim();
  const match = normalized.match(/^(\d+(?:\.\d+)?)([kKmMbB])?$/);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);

  if (!Number.isFinite(amount)) {
    return null;
  }

  const suffix = match[2] ? match[2].toLowerCase() : "";
  const multipliers = { k: 1e3, m: 1e6, b: 1e9 };

  return Math.round(amount * (multipliers[suffix] || 1));
}

function parseProfileViews(svg) {
  const texts = [...svg.matchAll(/>([^<>]+)</g)]
    .map((match) => match[1].trim())
    .filter(Boolean);

  const candidate = texts.reverse().find((text) => parseHumanNumber(text) !== null);

  return candidate ? parseHumanNumber(candidate) : null;
}

function parseRank(svg) {
  const match = svg.match(/>(S|A\+|A-|A|B\+|B-|B|C\+|C)</);
  return match ? match[1] : null;
}

function isRankAtLeast(rank, minimumRank) {
  const rankIndex = RANK_ORDER.indexOf(rank);
  const minimumIndex = RANK_ORDER.indexOf(minimumRank);

  return rankIndex >= 0 && minimumIndex >= 0 && rankIndex >= minimumIndex;
}

function renderStatsBlock() {
  return [
    '<p align="left">',
    '  <img src="./profile/stats.svg" alt="GitHub Stats" />',
    '</p>',
  ].join("\n");
}

function renderViewsBlock() {
  return [
    '<p align="left">',
    '  <img src="./profile/views.svg" alt="Profile Views" />',
    '</p>',
  ].join("\n");
}

function renderHiddenBlock(content) {
  return ["<!--", content, "-->"] .join("\n");
}

function inferVisibilityFromCurrent(content) {
  const trimmed = content.trim();

  if (!trimmed) {
    return false;
  }

  return !trimmed.startsWith("<!--");
}

function getBlockInfo(readme, name) {
  const pattern = new RegExp(
    `<!-- README:${name}:START -->\\n?([\\s\\S]*?)\\n?<!-- README:${name}:END -->`,
  );
  const match = readme.match(pattern);

  if (!match) {
    throw new Error(`Missing README block markers for ${name}`);
  }

  return {
    pattern,
    currentInner: match[1].trim(),
  };
}

function replaceBlock(readme, name, nextInner) {
  const { pattern } = getBlockInfo(readme, name);
  const parts = [`<!-- README:${name}:START -->`];

  if (nextInner) {
    parts.push(nextInner);
  }

  parts.push(`<!-- README:${name}:END -->`);

  return readme.replace(pattern, parts.join("\n"));
}

let readme = readUtf8(readmePath);

const statsSvg = fs.existsSync(statsPath) ? readUtf8(statsPath) : "";
const viewsSvg = fs.existsSync(viewsPath) ? readUtf8(viewsPath) : "";

const statsBlock = getBlockInfo(readme, "STATS");
const viewsBlock = getBlockInfo(readme, "VIEWS");

const forcedRank = process.env.FORCE_STATS_RANK || null;
const forcedViewsCount = process.env.FORCE_PROFILE_VIEWS
  ? parseHumanNumber(process.env.FORCE_PROFILE_VIEWS)
  : null;

const rank = forcedRank || parseRank(statsSvg);
const viewsCount = forcedViewsCount ?? parseProfileViews(viewsSvg);

const statsVisible =
  rank === null ? inferVisibilityFromCurrent(statsBlock.currentInner) : isRankAtLeast(rank, MIN_VISIBLE_RANK);

const viewsVisible =
  viewsCount === null
    ? inferVisibilityFromCurrent(viewsBlock.currentInner)
    : viewsCount >= PROFILE_VIEWS_MIN;

const nextStats = statsVisible ? renderStatsBlock() : renderHiddenBlock(renderStatsBlock());

const nextViews = viewsVisible ? renderViewsBlock() : renderHiddenBlock(renderViewsBlock());

readme = replaceBlock(readme, "STATS", nextStats);
readme = replaceBlock(readme, "VIEWS", nextViews);

fs.writeFileSync(readmePath, `${readme.trimEnd()}\n`);

console.log(
  JSON.stringify(
    {
      rank,
      statsVisible,
      viewsCount,
      viewsVisible,
      profileViewsMin: PROFILE_VIEWS_MIN,
      minVisibleRank: MIN_VISIBLE_RANK,
    },
    null,
    2,
  ),
);