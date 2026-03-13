import { DataTypes } from "sequelize";

export default function createDocumentModel(sequelize) {
  return sequelize.define(
    "Document",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "Untitled Document",
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: "",
      },
      theme: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      tableName: "documents",
    },
  );
}
