#!/usr/bin/env python3
"""한국어 문서에서 자주 걸리는 AI 말투와 서식 위반을 줄 번호와 함께 보고한다.

사용법: python3 check-korean.py [--skip-code] [--skip-quotes] <파일>...
출력: 파일:줄: 종류: 해당 부분 (한 줄에 하나)
종료 코드: 찾은 것이 있으면 1, 없으면 0
"""
import argparse
import re
import sys

METAPHORS = ["파이프라인", "안전망", "바벨", "완충재", "물타기", "방어적 손절"]
TRANSLATIONESE = ["을 통해", "를 통해", "에 대해", "에 기반하여"]

RE_FENCE = re.compile(r"^\s*(```|~~~)")
RE_INLINE_CODE = re.compile(r"`[^`]*`")
RE_QUOTES = re.compile(r"\"[^\"]*\"|“[^”]*”|‘[^’]*’")
RE_LIST_ITEM = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+(.*)$")
RE_TABLE_SEPARATOR = re.compile(r"^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$")
RE_SENTENCE_END = re.compile(r"(?<=[가-힣)\]'\"])[.?!](?=\s+\S)")
RE_CONNECTIVE_COMMA = re.compile(r"[가-힣](?:고|며|해|서|라|면|지만|는데|므로),(?=\s|$)")
RE_BOLD_HEADING = re.compile(r"^\s*(?:[-*+]|\d+[.)])?\s*\*\*[^*]+(?::\*\*|\*\*\s*:)")
RE_DATE = re.compile(r"(?<![\w/.])(?:1[0-2]|0?[1-9])/(?:3[01]|[12]\d|0?[1-9])(?![\w/])")


def mask(text, pattern):
    return pattern.sub(lambda m: " " * len(m.group(0)), text)


def excerpt(line, start, end, margin=12):
    left = max(0, start - margin)
    right = min(len(line), end + margin)
    return line[left:right].strip()


def count_sentences(text):
    text = mask(text, RE_INLINE_CODE)
    count = 0
    for match in RE_SENTENCE_END.finditer(text):
        rest = text[match.end():]
        if re.search(r"[가-힣]", rest):
            count += 1
    return count + 1 if count else 1


def split_cells(line):
    stripped = line.strip()
    if not stripped.startswith("|") or RE_TABLE_SEPARATOR.match(stripped):
        return []
    body = stripped.strip("|")
    return [cell.strip() for cell in re.split(r"(?<!\\)\|", body)]


def check_line(line, skip_code, skip_quotes):
    findings = []
    work = line
    if skip_code:
        work = mask(work, RE_INLINE_CODE)
    if skip_quotes:
        work = mask(work, RE_QUOTES)

    for symbol, kind in (("·", "가운데점"), ("—", "줄표"), ("–", "en dash")):
        for match in re.finditer(re.escape(symbol), work):
            findings.append((kind, excerpt(line, match.start(), match.end())))

    for match in RE_CONNECTIVE_COMMA.finditer(work):
        findings.append(("연결어미 뒤 쉼표", excerpt(line, match.start(), match.end())))

    match = RE_BOLD_HEADING.match(work)
    if match:
        findings.append(("굵은 머리말", excerpt(line, match.start(), match.end(), 0)))

    for word in METAPHORS:
        for match in re.finditer(re.escape(word), work):
            findings.append(("비유어", excerpt(line, match.start(), match.end())))

    for phrase in TRANSLATIONESE:
        for match in re.finditer(re.escape(phrase), work):
            findings.append(("번역투", excerpt(line, match.start() - 2, match.end())))

    for match in RE_DATE.finditer(work):
        findings.append(("날짜 표기", excerpt(line, match.start(), match.end())))

    item = RE_LIST_ITEM.match(work)
    cells = split_cells(work)
    if item and count_sentences(item.group(1)) >= 2:
        findings.append(("한 항목에 두 문장", excerpt(line, 0, len(line), 0)[:60]))
    for cell in cells:
        if count_sentences(cell) >= 2:
            findings.append(("한 칸에 두 문장", cell[:60]))
    return findings


def check_text(text, skip_code=False, skip_quotes=False):
    results = []
    in_fence = False
    for number, line in enumerate(text.splitlines(), start=1):
        if RE_FENCE.match(line):
            in_fence = not in_fence
            continue
        if in_fence and skip_code:
            continue
        if skip_quotes and line.lstrip().startswith(">"):
            continue
        for kind, part in check_line(line, skip_code, skip_quotes):
            results.append((number, kind, part))
    return results


def main(argv=None):
    parser = argparse.ArgumentParser(description="한국어 문서 점검")
    parser.add_argument("files", nargs="+", help="점검할 파일, 표준 입력은 -")
    parser.add_argument("--skip-code", action="store_true", help="코드 블록과 인라인 코드를 건너뜀")
    parser.add_argument("--skip-quotes", action="store_true", help="따옴표 안 문구와 인용 블록을 건너뜀")
    args = parser.parse_args(argv)

    found = False
    for path in args.files:
        if path == "-":
            text = sys.stdin.read()
        else:
            with open(path, encoding="utf-8") as handle:
                text = handle.read()
        for number, kind, part in check_text(text, args.skip_code, args.skip_quotes):
            found = True
            print(f"{path}:{number}: {kind}: {part}")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
