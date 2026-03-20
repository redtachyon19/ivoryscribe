import { DataTypes } from "sequelize";

export default function createPurchaseModel(sequelize) {
  return sequelize.define(
    "Purchase",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      productKey: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      stripeCheckoutSessionId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      stripePaymentIntentId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      amountTotal: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      currency: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "pending",
      },
      paidAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      tableName: "purchases",
    },
  );
}
