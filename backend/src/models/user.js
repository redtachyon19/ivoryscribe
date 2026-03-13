import { DataTypes } from "sequelize";

export default function createUserModel(sequelize) {
  return sequelize.define(
    "User",
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
    },
    {
      tableName: "users",
    },
  );
}
