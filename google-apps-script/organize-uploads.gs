/**
 * BSN Credit Card — auto-organize uploaded documents by applicant name.
 *
 * SETUP (one-time):
 * 1. Open the Google Form (the document-upload-only one) in Edit mode.
 * 2. Extensions -> Apps Script. Paste this whole file in, replacing Code.gs.
 * 3. Fill in PARENT_FOLDER_ID below.
 * 4. Run any function once from the editor (e.g. select `onFormSubmit` in the
 *    toolbar dropdown and click Run) — this prompts Google to ask for
 *    permission (Drive + Forms access). Approve it once.
 * 5. Click the clock icon (Triggers) in the left sidebar -> "+ Add Trigger":
 *      - Function: onFormSubmit
 *      - Event source: From form
 *      - Event type: On form submit
 *    Save.
 * 6. Done — every new submission will now auto-run this script.
 *
 * WHAT IT DOES:
 * On each form submission, reads the non-file-upload answer (the applicant's
 * name) and creates (or reuses) a Drive folder named after them under
 * PARENT_FOLDER_ID, then moves every uploaded file for that response into
 * it — so each applicant ends up with their own folder instead of
 * everything dumped into one flat folder.
 */

// ── Configuration — fill these in ───────────────────────────────────────────

// The Drive folder ID that should contain one subfolder per applicant.
// Get this from the folder's URL: drive.google.com/drive/folders/<THIS PART>
// Leave as '' to use the Form's own default "File responses" folder as the
// parent (Google creates one automatically the first time someone uploads).
const PARENT_FOLDER_ID = '1eiBBIEgar1mtHEam2ybD1-uU2wSjROpj'; // "BOT-B" folder

// ── Trigger entry point ──────────────────────────────────────────────────

function onFormSubmit(e) {
  try {
    const response = e.response;
    const itemResponses = response.getItemResponses();

    let applicantName = '';
    const fileIds = [];

    for (const itemResponse of itemResponses) {
      const item = itemResponse.getItem();

      if (item.getType() === FormApp.ItemType.FILE_UPLOAD) {
        const answer = itemResponse.getResponse();
        // File-upload answers are always an array of Drive file IDs, even
        // when only one file was uploaded.
        const ids = Array.isArray(answer) ? answer : [answer];
        ids.forEach((id) => { if (id) fileIds.push(id); });
        continue;
      }

      // Any non-file-upload question is treated as the name field — this
      // form only has the name + upload questions, so no title-matching
      // (which broke when the actual title didn't exactly match) is needed.
      if (!applicantName) {
        applicantName = String(itemResponse.getResponse() || '').trim();
      }
    }

    if (fileIds.length === 0) {
      Logger.log('No uploaded files found on this response — nothing to move.');
      return;
    }

    const folderName = sanitizeFolderName(applicantName) || 'Tiada_Nama_' + Utilities.formatDate(new Date(), 'GMT+8', 'yyyyMMdd_HHmmss');
    const parent = getParentFolder(fileIds[0]);
    const applicantFolder = getOrCreateFolder(parent, folderName);

    fileIds.forEach((fileId) => moveFileToFolder(fileId, applicantFolder));

    Logger.log(`Moved ${fileIds.length} file(s) into folder "${folderName}".`);
  } catch (err) {
    Logger.log('onFormSubmit error: ' + err);
    // Re-throw so a failed run shows up under Executions in the Apps Script
    // dashboard — silent failures here would be worse than a visible error.
    throw err;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function sanitizeFolderName(name) {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, ''); // strip characters Drive folder names can't use cleanly
}

function getParentFolder(sampleFileId) {
  if (PARENT_FOLDER_ID) {
    return DriveApp.getFolderById(PARENT_FOLDER_ID);
  }
  // Fall back to wherever the just-uploaded file already lives — that's
  // Google's own auto-created "File responses" folder for this Form. This
  // works whether or not the Form has a linked response Spreadsheet (a
  // Form with no linked Sheet has no getDestinationId() to derive it from).
  const file = DriveApp.getFileById(sampleFileId);
  const parents = file.getParents();
  if (parents.hasNext()) return parents.next();
  return DriveApp.getRootFolder();
}

function getOrCreateFolder(parent, name) {
  const existing = parent.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return parent.createFolder(name);
}

function moveFileToFolder(fileId, targetFolder) {
  const file = DriveApp.getFileById(fileId);
  const currentParents = file.getParents();
  targetFolder.addFile(file);
  while (currentParents.hasNext()) {
    const p = currentParents.next();
    if (p.getId() !== targetFolder.getId()) p.removeFile(file);
  }
}
