<script>
  let { property, value = '', label = '', options = [], onchange } = $props();

  function onChange(e) {
    onchange?.({ property, value: e.target.value });
  }
</script>

<div class="polish-control-row">
  <label class="polish-control-label">{label}</label>
  <div class="polish-control-inputs">
    <select
      class="polish-select-input"
      data-property={property}
      {value}
      onchange={onChange}
    >
      {#each options as opt}
        <option value={opt.value !== undefined ? opt.value : opt}>
          {opt.label !== undefined ? opt.label : opt}
        </option>
      {/each}
    </select>
  </div>
</div>

<style>
  .polish-control-row {
    margin-bottom: 6px;
  }
  .polish-control-label {
    display: block;
    font-size: 10px;
    color: #888;
    margin-bottom: 3px;
  }
  .polish-control-inputs {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .polish-select-input {
    flex: 1;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    color: #e0e0e0;
    font-family: inherit;
    font-size: 11px;
    padding: 3px 4px;
    outline: none;
    cursor: pointer;
  }
  .polish-select-input:focus {
    border-color: #4A9EFF;
  }
  .polish-select-input option {
    background: #2a2a2a;
    color: #e0e0e0;
  }
</style>
