"""User interactions with the workbench's select-only comboboxes."""
import json

def select_value(page, label, value):
    page.get_by_role('combobox', name=label, exact=True).click()
    page.get_by_role('listbox', name=label, exact=True).locator('[role="option"][data-value='+json.dumps(str(value), ensure_ascii=False)+']').click()
