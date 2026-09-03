import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from "sequelize";
import type { Document } from "./document.ts";
import type { User } from "./user.ts";

export type SharePermission = "view" | "edit";
export type ShareStatus = "pending" | "accepted" | "rejected" | "revoked";

export class Share extends Model<InferAttributes<Share>, InferCreationAttributes<Share>> {
  declare id: CreationOptional<string>;
  declare documentId: string;
  declare ownerId: string;
  declare recipientId: string | null;
  declare recipientEmail: string;
  declare permission: CreationOptional<SharePermission>;
  declare inviteToken: string | null;
  declare status: CreationOptional<ShareStatus>;
  declare acceptedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Populated only when eager-loaded via `include`. NonAttribute keeps these
  // out of InferAttributes so they are not treated as columns.
  declare document?: NonAttribute<Document>;
  declare owner?: NonAttribute<User>;
  declare recipient?: NonAttribute<User>;
}

export default function createShareModel(sequelize: Sequelize): typeof Share {
  Share.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      documentId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      ownerId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      recipientId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      recipientEmail: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      permission: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "edit",
        validate: {
          isIn: [["view", "edit"]],
        },
      },
      inviteToken: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "pending",
        validate: {
          isIn: [["pending", "accepted", "rejected", "revoked"]],
        },
      },
      acceptedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      modelName: "Share",
      tableName: "shares",
    },
  );

  return Share;
}
