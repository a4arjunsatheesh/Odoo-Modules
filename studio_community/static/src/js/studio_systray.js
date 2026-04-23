/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { Dialog } from "@web/core/dialog/dialog";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, onMounted, useRef, useState } from "@odoo/owl";

function prettifyViewType(viewType) {
    if (!viewType) {
        return _t("Unknown");
    }
    return viewType.charAt(0).toUpperCase() + viewType.slice(1);
}

function getCurrentViewRoot(viewType) {
    const selectors = {
        calendar: ".o_action_manager .o_calendar_view",
        form: ".o_action_manager .o_form_view",
        kanban: ".o_action_manager .o_kanban_view",
        list: ".o_action_manager .o_list_view",
    };
    return document.querySelector(selectors[viewType]) || null;
}

function getPreviewContentRoot(viewType) {
    const root = getCurrentViewRoot(viewType);
    if (!root) {
        return null;
    }
    if (viewType === "form") {
        return (
            root.querySelector(".o_form_sheet_bg") ||
            root.querySelector(".o_form_renderer") ||
            root.querySelector("form") ||
            root
        );
    }
    if (viewType === "list") {
        return (
            root.querySelector(".o_list_renderer") ||
            root.querySelector("table.o_list_table") ||
            root.querySelector("table") ||
            root
        );
    }
    if (viewType === "kanban") {
        return root.querySelector(".o_kanban_renderer") || root;
    }
    if (viewType === "calendar") {
        return root.querySelector(".o_calendar_renderer") || root;
    }
    return root;
}

function sanitizePreviewClone(clone, viewType) {
    const selectorsToRemove = [
        ".oe_chatter",
        ".o-mail-Form-chatter",
        ".o_ChatterContainer",
        ".o-mail-Chatter",
        ".o_attachment_preview",
        ".o-mail-Thread",
        ".o-mail-Composer",
        ".o-mail-Followers",
        ".o-mail-Activity",
    ];
    clone.querySelectorAll(selectorsToRemove.join(", ")).forEach((node) => node.remove());

    clone.querySelectorAll("input, textarea, select, button, a").forEach((node) => {
        node.setAttribute("tabindex", "-1");
    });
    clone.querySelectorAll("[contenteditable='true']").forEach((node) => {
        node.setAttribute("contenteditable", "false");
    });

    if (viewType === "form") {
        clone.classList.add("o_studio_sanitized_form");
        clone.querySelectorAll(".o_field_widget[name]").forEach((node) => {
            node.dataset.studioFieldName = node.getAttribute("name");
            node.classList.add("o_studio_clickable_field");
        });
        clone.querySelectorAll(".o_td_label, .o_wrap_label, .o_form_label").forEach((node) => {
            const directNextField =
                node.nextElementSibling?.querySelector(":scope .o_field_widget[name]")?.getAttribute("name") ||
                node.parentElement?.querySelector(":scope > .o_field_widget[name]")?.getAttribute("name") ||
                node.parentElement?.nextElementSibling
                    ?.querySelector(":scope .o_field_widget[name]")
                    ?.getAttribute("name") ||
                null;
            if (!directNextField) {
                return;
            }
            node.dataset.studioFieldName = directNextField;
            node.classList.add("o_studio_clickable_field");
            node.querySelectorAll("label").forEach((label) => {
                label.dataset.studioFieldName = directNextField;
                label.classList.add("o_studio_clickable_field");
            });
        });
        clone.querySelectorAll("label").forEach((node) => {
            const fieldName =
                node.getAttribute("for") ||
                node.closest("[data-studio-field-name]")?.dataset.studioFieldName ||
                node.closest(".o_td_label")?.nextElementSibling
                    ?.querySelector(":scope .o_field_widget[name]")
                    ?.getAttribute("name") ||
                node.closest("td")?.nextElementSibling
                    ?.querySelector(":scope .o_field_widget[name]")
                    ?.getAttribute("name") ||
                node.closest(".o_wrap_label")?.nextElementSibling
                    ?.querySelector(":scope .o_field_widget[name]")
                    ?.getAttribute("name") ||
                node.closest("tr")?.querySelector(".o_field_widget[name]")?.getAttribute("name") ||
                node.closest(".o_wrap_field")?.querySelector(".o_field_widget[name]")?.getAttribute("name");
            if (!fieldName) {
                return;
            }
            node.dataset.studioFieldName = fieldName;
            node.classList.add("o_studio_clickable_field");
        });
        clone.querySelectorAll(".o_cell, .o_wrap_field").forEach((node) => {
            const fieldName = node.querySelector(".o_field_widget[name]")?.getAttribute("name");
            if (!fieldName) {
                return;
            }
            node.dataset.studioFieldName = fieldName;
            node.classList.add("o_studio_clickable_field");
        });
    } else if (viewType === "list") {
        clone.classList.add("o_studio_sanitized_list");
        clone.querySelectorAll("th[data-name], td[data-name]").forEach((node) => {
            node.dataset.studioFieldName = node.getAttribute("data-name");
            node.classList.add("o_studio_clickable_field");
        });
    }
}

function createPreviewWrapper(viewType) {
    const wrapper = document.createElement("div");
    wrapper.classList.add("o_studio_preview_wrapper");
    if (viewType === "form") {
        wrapper.classList.add("o_form_view", "o_xxl_form_view");
    } else if (viewType === "list") {
        wrapper.classList.add("o_list_view");
    } else if (viewType === "kanban") {
        wrapper.classList.add("o_kanban_view");
    } else if (viewType === "calendar") {
        wrapper.classList.add("o_calendar_view");
    }
    return wrapper;
}

function buildFormFieldsFromDom(root) {
    const fields = [];
    const usedNames = new Set();
    const nodes = root.querySelectorAll(".o_field_widget[name]");

    for (const node of nodes) {
        const fieldName = node.getAttribute("name");
        if (!fieldName || usedNames.has(fieldName)) {
            continue;
        }
        usedNames.add(fieldName);
        const labelNode =
            node.closest(".o_wrap_field")?.previousElementSibling?.querySelector("label") ||
            node.closest(".o_field_widget")?.parentElement?.querySelector("label") ||
            root.querySelector(`label[for="${fieldName}"]`);
        const fieldClass = [...node.classList].find(
            (className) => className.startsWith("o_field_") && className !== "o_field_widget"
        );
        const fieldType = fieldClass?.replace("o_field_", "") || "char";
        fields.push({
            fieldName,
            technicalName: fieldName,
            label: labelNode?.textContent?.trim() || fieldName,
            type: fieldType,
            domain: "[]",
        });
    }
    return fields;
}

function buildListFieldsFromDom(root) {
    const fields = [];
    const usedNames = new Set();
    const headers = root.querySelectorAll("th[data-name], th.o_list_controller th");

    for (const header of headers) {
        const fieldName = header.dataset.name || header.getAttribute("data-name");
        const label = header.textContent?.trim();
        if ((!fieldName && !label) || usedNames.has(fieldName || label)) {
            continue;
        }
        usedNames.add(fieldName || label);
        fields.push({
            fieldName: fieldName || null,
            technicalName: fieldName || null,
            label: label || fieldName,
            type: "column",
            domain: "[]",
        });
    }
    return fields;
}

function buildViewContextFromScreen(actionService) {
    const currentController = actionService.currentController;
    const viewType =
        currentController?.props?.type ||
        (document.querySelector(".o_action_manager .o_form_view") && "form") ||
        (document.querySelector(".o_action_manager .o_list_view") && "list") ||
        (document.querySelector(".o_action_manager .o_kanban_view") && "kanban") ||
        (document.querySelector(".o_action_manager .o_calendar_view") && "calendar") ||
        "unknown";
    const root = getPreviewContentRoot(viewType);

    let existingFields = [];
    if (root && viewType === "form") {
        existingFields = buildFormFieldsFromDom(root);
    } else if (root && viewType === "list") {
        existingFields = buildListFieldsFromDom(root);
    }

    return {
        actionName: currentController?.displayName || currentController?.action?.name || _t("Current View"),
        resModel: currentController?.props?.resModel || _t("Unknown Model"),
        viewId: currentController?.config?.viewId || null,
        viewType,
        existingFields,
        hasExactPreview: Boolean(root),
    };
}

export class StudioBuilderDialog extends Component {
    static template = "studio_community.StudioBuilderDialog";
    static components = { Dialog };
    static props = ["close", "viewContext"];

    setup() {
        this.orm = useService("orm");
        this.previewRef = useRef("previewRoot");
        this.notification = useService("notification");
        this.state = useState({
            inspectorMode: "help",
            pendingLabelChanges: {},
            selectedField: null,
        });
        onMounted(() => this.mountExactPreview());
    }

    get dialogTitle() {
        return `${this.viewTypeLabel} Studio Builder`;
    }

    get viewTypeLabel() {
        return prettifyViewType(this.props.viewContext.viewType);
    }

    get canvasHeading() {
        return _t("%(viewType)s Preview", { viewType: this.viewTypeLabel });
    }

    get canvasHelp() {
        if (this.props.viewContext.hasExactPreview) {
            return _t(
                "This is a cloned snapshot of the current %(viewType)s view where the Studio button was clicked.",
                { viewType: this.props.viewContext.viewType }
            );
        }
        return _t(
            "This preview is loaded from the current %(viewType)s view where the Studio button was clicked.",
            { viewType: this.props.viewContext.viewType }
        );
    }

    get isInspectorVisible() {
        return this.state.inspectorMode === "details" && this.state.selectedField;
    }

    get selectedFieldTitle() {
        return this.state.selectedField?.label || _t("Field Details");
    }

    async onSave() {
        const changes = Object.entries(this.state.pendingLabelChanges);
        if (!changes.length) {
            this.notification.add(_t("No label changes to save."), {
                type: "warning",
            });
            return;
        }
        const saved = await this.orm.call("ir.ui.view", "studio_apply_label_updates", [
            this.props.viewContext.viewId,
            this.props.viewContext.viewType,
            this.state.pendingLabelChanges,
        ]);
        if (!saved) {
            this.notification.add(_t("Nothing was updated in the backend view."), {
                type: "warning",
            });
            return;
        }
        this.notification.add(_t("Field label changes saved to the current view."), {
            type: "success",
        });
        this.props.close();
    }

    backToPreviewHelp() {
        this.state.inspectorMode = "help";
        this.state.selectedField = null;
        this.clearSelectedPreviewNodes();
    }

    findFieldMetadata(fieldName) {
        if (!fieldName) {
            return null;
        }
        return this.props.viewContext.existingFields.find((field) => field.fieldName === fieldName) || null;
    }

    clearSelectedPreviewNodes() {
        this.previewRef.el
            ?.querySelectorAll(".o_studio_selected_field")
            .forEach((node) => node.classList.remove("o_studio_selected_field"));
    }

    highlightSelectedField(fieldName) {
        this.clearSelectedPreviewNodes();
        if (!fieldName) {
            return;
        }
        this.previewRef.el
            ?.querySelectorAll(`[data-studio-field-name="${CSS.escape(fieldName)}"]`)
            .forEach((node) => node.classList.add("o_studio_selected_field"));
    }

    onPreviewClick(ev) {
        const fieldNode = ev.target.closest("[data-studio-field-name]");
        if (!fieldNode || !this.previewRef.el?.contains(fieldNode)) {
            return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        const fieldName = fieldNode.dataset.studioFieldName;
        const metadata = this.findFieldMetadata(fieldName);
        if (!metadata) {
            return;
        }
        this.state.selectedField = metadata;
        this.state.inspectorMode = "details";
        this.highlightSelectedField(fieldName);
    }

    onFieldLabelInput(ev) {
        const newLabel = ev.target.value;
        const fieldName = this.state.selectedField?.fieldName;
        if (!fieldName) {
            return;
        }
        this.state.selectedField.label = newLabel;
        for (const field of this.props.viewContext.existingFields) {
            if (field.fieldName === fieldName) {
                field.label = newLabel;
            }
        }
        this.state.pendingLabelChanges[fieldName] = newLabel;
        this.updatePreviewFieldLabel(fieldName, newLabel);
    }

    updatePreviewFieldLabel(fieldName, newLabel) {
        const previewRoot = this.previewRef.el;
        if (!previewRoot) {
            return;
        }
        const escaped = CSS.escape(fieldName);
        previewRoot.querySelectorAll(`label[data-studio-field-name="${escaped}"]`).forEach((node) => {
            node.textContent = newLabel;
        });
        previewRoot
            .querySelectorAll(
                `.o_td_label[data-studio-field-name="${escaped}"], .o_wrap_label[data-studio-field-name="${escaped}"], .o_form_label[data-studio-field-name="${escaped}"]`
            )
            .forEach((node) => {
                const labelNode = node.querySelector("label");
                if (labelNode) {
                    labelNode.textContent = newLabel;
                } else {
                    node.textContent = newLabel;
                }
            });
        previewRoot.querySelectorAll(`th[data-studio-field-name="${escaped}"]`).forEach((node) => {
            node.textContent = newLabel;
        });
    }

    mountExactPreview() {
        const previewHost = this.previewRef.el;
        if (!previewHost || !this.props.viewContext.hasExactPreview) {
            return;
        }
        const currentRoot = getPreviewContentRoot(this.props.viewContext.viewType);
        if (!currentRoot) {
            return;
        }
        const clone = currentRoot.cloneNode(true);
        sanitizePreviewClone(clone, this.props.viewContext.viewType);
        const wrapper = createPreviewWrapper(this.props.viewContext.viewType);
        wrapper.appendChild(clone);
        previewHost.replaceChildren(wrapper);
        previewHost.addEventListener("click", this.onPreviewClick.bind(this));
    }
}

export class StudioSystray extends Component {
    static template = "studio_community.StudioSystray";

    setup() {
        this.action = useService("action");
        this.dialog = useService("dialog");
    }

    onClick() {
        const viewContext =
            this.action.currentController?.studioCommunityViewContext ||
            buildViewContextFromScreen(this.action);
        this.dialog.add(StudioBuilderDialog, { viewContext });
    }
}

registry.category("systray").add(
    "studio_community.studio_systray",
    { Component: StudioSystray },
    { sequence: 10 }
);
