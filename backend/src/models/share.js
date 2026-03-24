import { DataTypes } from "sequelize";

export default function createShareModel(sequelize) {
  return sequelize.define(
    "Share",
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
        defaultValue: "view",
        validate: {
          isIn: [["view", "edit"]],
        },
      },
      inviteToken: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "pending",
        validate: {
          isIn: [["pending", "accepted", "revoked"]],
        },
      },
      acceptedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "shares",
    },
  );
}
