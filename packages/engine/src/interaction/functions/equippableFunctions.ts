import { Entity } from "../../ecs/classes/Entity"
import { addComponent, hasComponent, removeComponent } from "../../ecs/functions/EntityFunctions"
import { NetworkObject } from "../../networking/components/NetworkObject"
import { EquippedComponent } from "../components/EquippedComponent"
import { EquippableAttachmentPoint, EquippedStateUpdateSchema } from "../enums/EquippedEnums"

export const equipEntity = (equipperEntity: Entity, equippedEntity: Entity, attachmentPoint: EquippableAttachmentPoint = EquippableAttachmentPoint.RIGHT_HAND): void => {
  if(!hasComponent(equipperEntity, EquippedComponent) && hasComponent(equippedEntity, NetworkObject)) {
    addComponent(equipperEntity, EquippedComponent, { equippedEntity: equippedEntity, attachmentPoint });
  }
}

export const unequipEntity = (equipperEntity: Entity): void => {
  if(hasComponent(equipperEntity, EquippedComponent))  {
    removeComponent(equipperEntity, EquippedComponent);
  }
}