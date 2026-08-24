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

export class Document extends Model<InferAttributes<Document>, InferCreationAttributes<Document>> {
  declare id: CreationOptional<string>;
  declare title: CreationOptional<string>;
  declare content: CreationOptional<string>;
  declare theme: CreationOptional<Record<string, unknown>>;
  declare metadata: CreationOptional<Record<string, unknown>>;
  // Added by User.hasMany(Document, { foreignKey: "userId" }) in models/index.
  declare userId: ForeignKey<User["id"]>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function createDocumentModel(sequelize: Sequelize): typeof Document {
  Document.init(
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
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      modelName: "Document",
      tableName: "documents",
    },
  );

  return Document;
}
