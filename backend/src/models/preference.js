import { DataTypes } from "sequelize";

export default function createPreferenceModel(sequelize) {
  return sequelize.define(
    "Preference",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      theme: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
      },
      editorSettings: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
      },
      uiSettings: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      tableName: "preferences",
    },
  );
}
