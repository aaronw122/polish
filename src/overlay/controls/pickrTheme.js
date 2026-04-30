export const PICKR_DARK_OVERRIDES = `
    .pcr-button {
      display: none !important;
    }
    .pcr-app[data-theme="nano"] {
      background: rgba(30, 30, 30, 0.98);
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      padding: 8px;
      width: 100%;
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
    }
    .pcr-app[data-theme="nano"] .pcr-selection {
      display: grid;
      gap: 6px;
    }
    .pcr-app[data-theme="nano"] .pcr-selection .pcr-color-preview {
      margin: 0;
    }
    .pcr-app[data-theme="nano"] .pcr-selection .pcr-color-preview .pcr-current-color {
      border-radius: 4px;
    }
    .pcr-app[data-theme="nano"] .pcr-selection .pcr-color-chooser,
    .pcr-app[data-theme="nano"] .pcr-selection .pcr-color-opacity {
      margin: 0;
    }
    .pcr-app[data-theme="nano"] .pcr-selection .pcr-color-chooser .pcr-slider,
    .pcr-app[data-theme="nano"] .pcr-selection .pcr-color-opacity .pcr-slider {
      border-radius: 4px;
    }
    .pcr-app[data-theme="nano"] .pcr-interaction {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0;
      margin-top: 2px;
    }
    .pcr-app[data-theme="nano"] .pcr-interaction input.pcr-result {
      flex: 1;
      min-width: 0;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #e0e0e0;
      border-radius: 3px;
      font-family: inherit;
      font-size: 11px;
      padding: 4px 6px;
      height: auto;
      margin: 0;
      box-shadow: none;
    }
    .pcr-app[data-theme="nano"] .pcr-interaction input.pcr-result:focus {
      border-color: #4A9EFF;
    }
    .pcr-app[data-theme="nano"] .pcr-interaction .pcr-type {
      display: none;
    }
    .pcr-app[data-theme="nano"] .pcr-interaction .pcr-save,
    .pcr-app[data-theme="nano"] .pcr-interaction .pcr-cancel,
    .pcr-app[data-theme="nano"] .pcr-interaction .pcr-clear {
      display: none;
    }
    .pcr-no-color {
      width: 24px;
      height: 24px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.06);
      cursor: pointer;
      position: relative;
      padding: 0;
      flex-shrink: 0;
    }
    .pcr-no-color:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.25);
    }
    .pcr-no-color::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 50%;
      width: 1.5px;
      height: 16px;
      background: #e55;
      transform: translateX(-50%) rotate(45deg);
    }
    .pcr-no-color.active {
      border-color: rgba(74, 158, 255, 0.5);
      background: rgba(74, 158, 255, 0.1);
    }
  `;
