(() => {
  const jsonLikeColumnPatterns = [
    /targeting/i,
    /promoted\s*object/i,
    /creative/i,
    /object\s*story\s*spec/i,
    /asset\s*feed\s*spec/i,
    /tracking\s*specs/i,
    /conversion\s*specs/i,
    /attribution\s*spec/i,
    /degrees\s*of\s*freedom\s*spec/i,
    /frequency\s*control\s*specs/i
  ];

  const removableJsonKeys = new Set([
    'id',
    'account_id',
    'campaign_id',
    'adset_id',
    'ad_id',
    'source_campaign_id',
    'source_adset_id',
    'source_ad_id',
    'created_time',
    'updated_time',
    'effective_status',
    'insights'
  ]);

  const clearExactColumns = new Set([
    'campaign id',
    'ad set id',
    'adset id',
    'ad id',
    'created time',
    'last updated time',
    'reporting starts',
    'reporting ends'
  ]);

  const statusColumns = new Set(['campaign status', 'ad set status', 'ad status']);

  const clearCellPatterns = [
    /(^|\b)campaign\s*id(\b|$)/i,
    /(^|\b)ad\s*set\s*id(\b|$)/i,
    /(^|\b)adset\s*id(\b|$)/i,
    /(^|\b)ad\s*id(\b|$)/i,
    /(^|\b)source\s*campaign\s*id(\b|$)/i,
    /(^|\b)source\s*ad\s*set\s*id(\b|$)/i,
    /(^|\b)source\s*adset\s*id(\b|$)/i,
    /(^|\b)source\s*ad\s*id(\b|$)/i
  ];

  const dropOnlyColumnPatterns = [
    /created\s*time/i,
    /updated\s*time/i,
    /created\s*at/i,
    /updated\s*at/i,
    /delivery/i,
    /results/i,
    /reach/i,
    /impressions/i,
    /frequency/i,
    /amount\s*spent/i,
    /^spend$/i,
    /cpm/i,
    /cpc/i,
    /ctr/i,
    /clicks/i,
    /link\s*clicks/i,
    /purchases/i,
    /conversions/i,
    /cost\s*per/i,
    /budget\s*remaining/i,
    /quality\s*ranking/i,
    /engagement\s*rate\s*ranking/i,
    /conversion\s*rate\s*ranking/i
  ];

  const els = {
    fileInput: null,
    cleanBtn: null,
    log: null
  };

  const normalizeName = (value) => String(value ?? '').trim().toLowerCase().replace(/[_-]/g, ' ');
  const matchesAnyPattern = (value, patterns) => patterns.some((pattern) => pattern.test(normalizeName(value)));
  const normalizeColumnKey = (column) => normalizeName(column);

  function log(message, type = 'info') {
    if (!els.log) return;
    const row = document.createElement('div');
    row.className = type;
    row.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    els.log.appendChild(row);
    els.log.scrollTop = els.log.scrollHeight;
  }

  function clearLog() {
    if (!els.log) return;
    els.log.innerHTML = '';
  }

  function tryParseJson(value) {
    if (typeof value !== 'string') return { parsed: false, value };
    const trimmed = value.trim();
    if (!trimmed) return { parsed: false, value };
    const looksJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
    if (!looksJson) return { parsed: false, value };

    const candidates = [trimmed];
    if (trimmed.includes("'") && !trimmed.includes('"')) candidates.push(trimmed.replaceAll("'", '"'));

    for (const candidate of candidates) {
      try { return { parsed: true, value: JSON.parse(candidate) }; } catch (_) {}
    }
    return { parsed: false, value };
  }

  function deepCleanJson(obj) {
    if (Array.isArray(obj)) return obj.map((item) => deepCleanJson(item));
    if (obj && typeof obj === 'object') {
      const cleaned = {};
      Object.entries(obj).forEach(([key, value]) => {
        if (removableJsonKeys.has(key)) return;
        cleaned[key] = deepCleanJson(value);
      });
      return cleaned;
    }
    return obj;
  }

  function cleanCell(value, columnName) {
    const isJsonColumn = matchesAnyPattern(columnName, jsonLikeColumnPatterns);
    const parsed = tryParseJson(value);
    if (parsed.parsed || isJsonColumn) {
      if (parsed.parsed) return JSON.stringify(deepCleanJson(parsed.value));
      return value;
    }
    return value;
  }

  function shouldDropColumn(column) {
    return matchesAnyPattern(column, dropOnlyColumnPatterns);
  }

  function shouldClearCellByColumn(column) {
    return matchesAnyPattern(column, clearCellPatterns);
  }

  function cleanSheetRows(rows) {
    if (!rows.length) return { rows, droppedColumns: [] };

    const originalColumns = Object.keys(rows[0]);
    const droppedColumns = [];
    const keptColumns = originalColumns.filter((column) => {
      const drop = shouldDropColumn(column);
      if (drop) droppedColumns.push(column);
      return !drop;
    });

    const cleanedRows = rows.map((row) => {
      const cleanedRow = {};
      keptColumns.forEach((column) => {
        const normalizedColumn = normalizeColumnKey(column);
        if (clearExactColumns.has(normalizedColumn) || shouldClearCellByColumn(column)) {
          cleanedRow[column] = '';
        } else if (statusColumns.has(normalizedColumn)) {
          cleanedRow[column] = 'PAUSED';
        } else {
          cleanedRow[column] = cleanCell(row[column], column);
        }
      });
      return cleanedRow;
    });

    return { rows: cleanedRows, droppedColumns };
  }

  function buildOutputName(inputFileName) {
    const base = inputFileName.replace(/\.[^.]+$/, '');
    return `${base}_cleaned.csv`;
  }

  function downloadCsvFromFirstSheet(workbook, fileName) {
    const firstSheetName = workbook.SheetNames[0];
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  async function processFile() {
    clearLog();

    const file = els.fileInput.files?.[0];
    if (!file) {
      log('Сначала загрузите CSV/XLSX файл.', 'error');
      return;
    }

    const originalBtnText = els.cleanBtn.textContent;
    els.cleanBtn.disabled = true;
    els.cleanBtn.textContent = 'Обрабатываю...';

    try {
      log(`Файл: ${file.name}`, 'info');
      log(`Размер: ${(file.size / 1024).toFixed(1)} KB`, 'info');

      const buffer = await readFileAsArrayBuffer(file);
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });
      const outputWorkbook = XLSX.utils.book_new();

      for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });
        log(`Лист "${sheetName}": строк ${rows.length}`, 'info');

        if (!rows.length) {
          XLSX.utils.book_append_sheet(outputWorkbook, XLSX.utils.aoa_to_sheet([]), sheetName.slice(0, 31));
          log(`Лист "${sheetName}" пустой, перенесён без изменений.`, 'warning');
          continue;
        }

        const { rows: cleanedRows, droppedColumns } = cleanSheetRows(rows);
        XLSX.utils.book_append_sheet(outputWorkbook, XLSX.utils.json_to_sheet(cleanedRows), sheetName.slice(0, 31));

        if (droppedColumns.length) {
          log(`Удалено колонок: ${droppedColumns.length}`, 'success');
        } else {
          log('Статистические колонки не найдены.', 'info');
        }
      }

      const outputName = buildOutputName(file.name);
      downloadCsvFromFirstSheet(outputWorkbook, outputName);
      log(`Готово. Скачан файл: ${outputName}`, 'success');
    } catch (error) {
      console.error(error);
      log(error.message || String(error), 'error');
    } finally {
      els.cleanBtn.disabled = false;
      els.cleanBtn.textContent = originalBtnText;
    }
  }

  function init() {
    els.fileInput = document.getElementById('fileInput');
    els.cleanBtn = document.getElementById('cleanBtn');
    els.log = document.getElementById('log');

    if (!els.fileInput || !els.cleanBtn || !els.log) return false;

    els.cleanBtn.addEventListener('click', processFile);
    log('Готов к работе.', 'success');
    return true;
  }

  function initWithRetry(attempt = 0) {
    if (init()) return;
    if (attempt >= 30) {
      console.warn('Meta Campaign Cleaner: интерфейс не найден. Проверьте, что открыт index.html с нужной разметкой.');
      return;
    }
    setTimeout(() => initWithRetry(attempt + 1), 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initWithRetry());
  } else {
    initWithRetry();
  }
})();
