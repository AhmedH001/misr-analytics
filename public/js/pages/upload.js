// Upload Page — data management
class PageUpload {
  static init() {
    this.setupDragDrop();
    this.setupDownloadButton();
  }

  static setupDragDrop() {
    const dropzone = document.getElementById('dropzone');
    if (!dropzone) return;

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag');
      const files = e.dataTransfer.files;
      if (files.length > 0) this.uploadFile(files[0]);
    });

    dropzone.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv';
      input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) this.uploadFile(e.target.files[0]);
      });
      input.click();
    });
  }

  static setupDownloadButton() {
    const downloadBtn = document.getElementById('downloadDataBtn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        APIService.downloadData();
      });
    }
  }

  static async uploadFile(file) {
    const dropzone = document.getElementById('dropzone');
    dropzone.classList.add('done');
    let result = document.getElementById('uploadResult');
    if (!result) {
      result = document.createElement('div');
      result.id = 'uploadResult';
      dropzone.parentNode.insertBefore(result, dropzone.nextSibling);
    }

    try {
      result.innerHTML = '<div class="spin"></div><span>Uploading and training model…</span>';
      const response = await APIService.uploadFile(file);
      result.innerHTML = `<div class="alert ag">
        <span>✓</span>
        <div>
          <strong>${response.filename}</strong><br/>
          ${response.rows?.toLocaleString()} rows loaded<br/>
          R²=${(response.model.r2 * 1000).toFixed(0)}/1000 | RMSE=${response.model.rmse.toLocaleString()} EGP/m²
        </div>
      </div>`;
      // Reload app data
      AppController.loadInitialData();
    } catch (err) {
      result.innerHTML = `<div class="alert ae"><span>✕</span><span>${err.message}</span></div>`;
    } finally {
      dropzone.classList.remove('done');
    }
  }

  static onActive() {
    // Called when page becomes active
  }
}
