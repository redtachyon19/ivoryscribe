import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

/**
 * `sequelize.define` returns `ModelStatic<Model<any, any>>`, which makes every
 * attribute access an implicit `any` — so the models are declared as classes
 * with `Model.init` instead. `declare` fields are type-only and erase cleanly,
 * which matters because Node strips types rather than compiling them; a real
 * class field here would shadow Sequelize's attribute getters at runtime.
 */
export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare username: CreationOptional<string>;
  declare email: string | null;
  declare firstName: string | null;
  declare lastName: string | null;
  declare isEmailVerified: CreationOptional<boolean>;
  declare emailVerificationCode: string | null;
  declare emailVerificationExpiresAt: Date | null;
  declare accountDeletionToken: string | null;
  declare accountDeletionCode: string | null;
  declare accountDeletionExpiresAt: Date | null;
  declare passwordResetToken: string | null;
  declare passwordResetExpiresAt: Date | null;
  declare name: CreationOptional<string>;
  declare passwordHash: string;
  declare stripeCustomerId: string | null;
  declare tuskAiActivated: CreationOptional<boolean>;
  declare tuskAiActivatedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function createUserModel(sequelize: Sequelize): typeof User {
  User.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        defaultValue: () => `u_${Math.random().toString(36).slice(2, 12)}`,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isEmail: true,
          len: [3, 320],
        },
      },
      firstName: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: [1, 80],
        },
      },
      lastName: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: [1, 80],
        },
      },
      isEmailVerified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      emailVerificationCode: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      emailVerificationExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      accountDeletionToken: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      accountDeletionCode: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      accountDeletionExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      passwordResetToken: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      passwordResetExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "",
        validate: {
          len: [0, 80],
        },
      },
      passwordHash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      stripeCustomerId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      tuskAiActivated: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      tuskAiActivatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      // Sequelize adds these automatically; declaring them keeps the attribute
      // map exhaustive for InferAttributes. allowNull mirrors what Sequelize
      // generates on its own, so the schema is unchanged.
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      modelName: "User",
      tableName: "users",
    },
  );

  return User;
}
