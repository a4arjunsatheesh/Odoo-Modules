/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { FormController } from "@web/views/form/form_controller";
import { ListController } from "@web/views/list/list_controller";
import { onMounted, onRendered } from "@odoo/owl";

function getFieldLabel(fieldInfo, fieldDef, fallbackName) {
    return fieldDef?.field_description || fieldDef?.string || fieldDef?.label || fieldInfo?.string || fallbackName;
}

function buildExistingField(field) {
    return {
        fieldName: field.name,
        technicalName: field.technicalName || field.name,
        label: field.label,
        type: field.type,
        domain: field.domain || "[]",
    };
}

function buildFieldDefs(fields) {
    return Object.fromEntries(
        Object.entries(fields || {}).map(([fieldName, fieldDef]) => [
            fieldName,
            {
                fieldDescription: fieldDef.field_description || fieldDef.string || fieldDef.label || fieldName,
                type: fieldDef.type,
                domain: fieldDef.domain || "[]",
            },
        ])
    );
}

function isNestedFieldNode(node) {
    let parent = node.parentElement;
    while (parent) {
        if (parent.tagName === "field") {
            return true;
        }
        parent = parent.parentElement;
    }
    return false;
}

function publishViewContext(controller, snapshotBuilder) {
    const currentController = controller.actionService.currentController;
    if (!currentController || currentController.action?.type !== "ir.actions.act_window") {
        return;
    }
    currentController.studioCommunityViewContext = snapshotBuilder(controller);
    controller.env.bus.trigger(
        "studio_community:view_context_updated",
        currentController.studioCommunityViewContext
    );
}

function buildFormViewContext(controller) {
    const existingFields = [];

    for (const node of controller.archInfo.xmlDoc.querySelectorAll("field[field_id]")) {
        if (isNestedFieldNode(node)) {
            continue;
        }
        const fieldId = node.getAttribute("field_id");
        const fieldInfo = controller.archInfo.fieldNodes[fieldId];
        if (!fieldInfo) {
            continue;
        }
        const fieldDef = controller.props.fields[fieldInfo.name];
        existingFields.push(
            buildExistingField(
                {
                    name: fieldInfo.name,
                    technicalName: fieldInfo.name,
                    label: getFieldLabel(fieldInfo, fieldDef, fieldInfo.name),
                    type: fieldInfo.type || fieldDef?.type,
                    domain: fieldInfo.domain || fieldDef?.domain || "[]",
                }
            )
        );
    }

    return {
        actionName: controller.actionService.currentController.displayName || controller.props.resModel,
        resModel: controller.props.resModel,
        viewId: controller.env.config.viewId,
        viewType: "form",
        existingFields,
        fieldDefs: buildFieldDefs(controller.props.fields),
    };
}

function buildListViewContext(controller) {
    const existingFields = [];

    for (const column of controller.archInfo.columns) {
        if (column.type !== "field") {
            continue;
        }
        existingFields.push(
            buildExistingField(
                {
                    name: column.name,
                    technicalName: column.name,
                    label: getFieldLabel(column, controller.props.fields[column.name], column.name),
                    type: column.fieldType || column.type,
                    domain: column.domain || controller.props.fields[column.name]?.domain || "[]",
                }
            )
        );
    }

    return {
        actionName: controller.actionService.currentController.displayName || controller.props.resModel,
        resModel: controller.props.resModel,
        viewId: controller.env.config.viewId,
        viewType: "list",
        existingFields,
        fieldDefs: buildFieldDefs(controller.props.fields),
    };
}

patch(FormController.prototype, {
    setup() {
        super.setup(...arguments);
        onMounted(() => publishViewContext(this, buildFormViewContext));
        onRendered(() => publishViewContext(this, buildFormViewContext));
    },
});

patch(ListController.prototype, {
    setup() {
        super.setup(...arguments);
        onMounted(() => publishViewContext(this, buildListViewContext));
        onRendered(() => publishViewContext(this, buildListViewContext));
    },
});
