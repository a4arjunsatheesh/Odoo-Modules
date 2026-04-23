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

function isSupportedViewType(viewType) {
    return viewType === "form" || viewType === "list";
}

function getCurrentViewRoot(viewType) {
    const selectors = {
        form: ".o_action_manager .o_form_view",
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
    return null;
}

function getFieldNameFromLabelFor(root, labelNode) {
    const forAttr = labelNode.getAttribute("for");
    if (!forAttr) {
        return null;
    }

    const target = root.querySelector(`#${CSS.escape(forAttr)}`);
    const targetField = target?.closest(".o_field_widget[name]");
    if (targetField) {
        return targetField.getAttribute("name");
    }

    return root.querySelector(`.o_field_widget[name="${CSS.escape(forAttr)}"]`) ? forAttr : null;
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
            const labelField = node.querySelector("label")
                ? getFieldNameFromLabelFor(clone, node.querySelector("label"))
                : null;
            const directNextField =
                labelField ||
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
                getFieldNameFromLabelFor(clone, node) ||
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
    }
    return wrapper;
}

function getFormFieldLabelNode(root, fieldNode, fieldName) {
    const fieldId = fieldNode.id;
    if (fieldId) {
        const labelById = root.querySelector(`label[for="${CSS.escape(fieldId)}"]`);
        if (labelById) {
            return labelById;
        }
    }

    const labelByName = root.querySelector(`label[for="${CSS.escape(fieldName)}"]`);
    if (labelByName) {
        return labelByName;
    }

    return null;
}

function getFieldDescription(fieldDefs, fieldName, fallbackLabel) {
    const fieldDef = fieldDefs?.[fieldName];
    if (fieldDef?.fieldDescription) {
        return fieldDef.fieldDescription;
    }
    return fieldDef?.field_description || fieldDef?.string || fieldDef?.label || fallbackLabel || fieldName;
}

function buildFieldDefs(fields = {}) {
    return Object.fromEntries(
        Object.entries(fields || {}).map(([fieldName, fieldDef]) => [
            fieldName,
            {
                fieldDescription: getFieldDescription(fields, fieldName, fieldName),
                type: fieldDef.type,
                domain: fieldDef.domain || "[]",
            },
        ])
    );
}

function buildFormFieldsFromDom(root, fieldDefs = {}) {
    const fields = [];
    const usedNames = new Set();
    const nodes = root.querySelectorAll(".o_field_widget[name]");

    for (const node of nodes) {
        const fieldName = node.getAttribute("name");
        const parentField = node.parentElement?.closest(".o_field_widget[name]");
        if (!fieldName || parentField || usedNames.has(fieldName)) {
            continue;
        }
        usedNames.add(fieldName);
        const labelNode = getFormFieldLabelNode(root, node, fieldName);
        const fieldClass = [...node.classList].find(
            (className) => className.startsWith("o_field_") && className !== "o_field_widget"
        );
        const fieldType = fieldClass?.replace("o_field_", "") || "char";
        fields.push({
            fieldName,
            technicalName: fieldName,
            label: getFieldDescription(fieldDefs, fieldName, labelNode?.textContent?.trim()),
            type: fieldType,
            domain: "[]",
        });
    }
    return fields;
}

function getOuterFieldWidget(fieldWidget, previewRoot) {
    let current = fieldWidget;
    let outerFieldWidget = fieldWidget;

    while (current?.parentElement && previewRoot.contains(current.parentElement)) {
        current = current.parentElement.closest(".o_field_widget[name]");
        if (current) {
            outerFieldWidget = current;
        }
    }

    return outerFieldWidget;
}

function getClickedFieldName(target, previewRoot) {
    const fieldWidget = target.closest(".o_field_widget[name]");
    if (fieldWidget && previewRoot.contains(fieldWidget)) {
        return getOuterFieldWidget(fieldWidget, previewRoot).getAttribute("name");
    }

    const explicitNode = target.closest("[data-studio-field-name]");
    if (explicitNode && previewRoot.contains(explicitNode)) {
        const containerField = explicitNode.closest(".o_field_widget[name]");
        if (containerField) {
            return getOuterFieldWidget(containerField, previewRoot).getAttribute("name");
        }
        return explicitNode.dataset.studioFieldName;
    }

    return null;
}

function getNodeIndex(node, nodes) {
    return Array.from(nodes).indexOf(node);
}

function waitForNextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function buildListFieldsFromDom(root, fieldDefs = {}) {
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
            label: fieldName ? getFieldDescription(fieldDefs, fieldName, label) : label,
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
        "unknown";
    if (!isSupportedViewType(viewType)) {
        return null;
    }
    const root = getPreviewContentRoot(viewType);

    let existingFields = [];
    if (root && viewType === "form") {
        existingFields = buildFormFieldsFromDom(root, currentController?.props?.fields);
    } else if (root && viewType === "list") {
        existingFields = buildListFieldsFromDom(root, currentController?.props?.fields);
    }

    return {
        actionName: currentController?.displayName || currentController?.action?.name || _t("Current View"),
        resModel: currentController?.props?.resModel || _t("Unknown Model"),
        viewId: currentController?.config?.viewId || null,
        viewType,
        existingFields,
        fieldDefs: buildFieldDefs(currentController?.props?.fields),
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
        this.fieldDescriptionCache = {};
        this.boundPreviewClick = this.onPreviewClick.bind(this);
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
        const metadata = this.props.viewContext.existingFields.find((field) => field.fieldName === fieldName);
        const fieldDef = this.props.viewContext.fieldDefs?.[fieldName];
        if (!metadata && !fieldDef) {
            return null;
        }
        return {
            fieldName,
            technicalName: metadata?.technicalName || fieldName,
            label: fieldDef?.fieldDescription || metadata?.label || fieldName,
            type: fieldDef?.type || metadata?.type,
            domain: fieldDef?.domain || metadata?.domain || "[]",
        };
    }

    async loadFieldDescription(fieldName) {
        if (!fieldName || !this.props.viewContext.resModel) {
            return null;
        }
        if (Object.hasOwn(this.fieldDescriptionCache, fieldName)) {
            return this.fieldDescriptionCache[fieldName];
        }

        const [fieldRecord] = await this.orm.searchRead(
            "ir.model.fields",
            [
                ["model", "=", this.props.viewContext.resModel],
                ["name", "=", fieldName],
            ],
            ["field_description"],
            { limit: 1 }
        );
        const fieldDescription = fieldRecord?.field_description || null;
        this.fieldDescriptionCache[fieldName] = fieldDescription;
        return fieldDescription;
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

    async onPreviewClick(ev) {
        const previewRoot = this.previewRef.el;
        if (!previewRoot) {
            return;
        }
        if (await this.switchNotebookPage(ev)) {
            return;
        }
        const fieldName = getClickedFieldName(ev.target, previewRoot);
        const metadata = this.findFieldMetadata(fieldName);
        if (!metadata) {
            return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        const fieldDescription = await this.loadFieldDescription(fieldName);
        if (fieldDescription) {
            metadata.label = fieldDescription;
        }
        this.state.selectedField = metadata;
        this.state.inspectorMode = "details";
        this.highlightSelectedField(fieldName);
    }

    async switchNotebookPage(ev) {
        const previewRoot = this.previewRef.el;
        const previewLink = ev.target.closest(".o_notebook_headers .nav-link");
        if (!previewRoot || !previewLink || !previewRoot.contains(previewLink)) {
            return false;
        }
        if (previewLink.closest(".nav-item")?.classList.contains("disabled")) {
            return false;
        }

        ev.preventDefault();
        ev.stopPropagation();

        const previewNotebook = previewLink.closest(".o_notebook");
        const previewNotebooks = previewRoot.querySelectorAll(".o_notebook");
        const notebookIndex = getNodeIndex(previewNotebook, previewNotebooks);
        const linkIndex = getNodeIndex(
            previewLink,
            previewNotebook.querySelectorAll(".o_notebook_headers .nav-link")
        );
        if (notebookIndex < 0 || linkIndex < 0) {
            return true;
        }

        const currentRoot = getPreviewContentRoot(this.props.viewContext.viewType);
        const sourceNotebook = currentRoot?.querySelectorAll(".o_notebook")?.[notebookIndex];
        const sourceLink = sourceNotebook?.querySelectorAll(".o_notebook_headers .nav-link")?.[linkIndex];
        if (!sourceLink) {
            return true;
        }

        sourceLink.click();
        await waitForNextFrame();
        this.mountExactPreview();
        return true;
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
        previewHost.removeEventListener("click", this.boundPreviewClick);
        previewHost.addEventListener("click", this.boundPreviewClick);
    }
}

export class StudioSystray extends Component {
    static template = "studio_community.StudioSystray";

    setup() {
        this.action = useService("action");
        this.dialog = useService("dialog");
        this.notification = useService("notification");
    }

    onClick() {
        const viewContext =
            this.action.currentController?.studioCommunityViewContext ||
            buildViewContextFromScreen(this.action);
        if (!viewContext || !isSupportedViewType(viewContext.viewType)) {
            this.notification.add(_t("Studio Community is available only in form and list views."), {
                type: "warning",
            });
            return;
        }
        this.dialog.add(StudioBuilderDialog, { viewContext });
    }
}

registry.category("systray").add(
    "studio_community.studio_systray",
    { Component: StudioSystray },
    { sequence: 10 }
);
