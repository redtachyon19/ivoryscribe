import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";
import type { User } from "./user.ts";

export class Preference extends Model<InferAttributes<Preference>, InferCreationAttributes<Preference>> {
  declare id: CreationOptional<string>;
  declare theme: CreationOptional<Record<string, unknown>>;
  declare editorSettings: CreationOptional<Record<string, unknown>>;
  declare uiSettings: CreationOptional<Record<string, unknown>>;
  // Added by User.hasOne(Preference, { foreignKey: "userId" }) in models/index.
  declare userId: ForeignKey<User["id"]>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function createPreferenceModel(sequelize: Sequelize): typeof Preference {
  Preference.init(
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
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      modelName: "Preference",
      tableName: "preferences",
    },
  );

  return Preference;
}
