import sequelize from "../config/database.ts";
import createUserModel from "./user.ts";
import createDocumentModel from "./document.ts";
import createPreferenceModel from "./preference.ts";
import createPurchaseModel from "./purchase.ts";
import createShareModel from "./share.ts";

const User = createUserModel(sequelize);
const Document = createDocumentModel(sequelize);
const Preference = createPreferenceModel(sequelize);
const Purchase = createPurchaseModel(sequelize);
const Share = createShareModel(sequelize);

User.hasMany(Document, { foreignKey: "userId", as: "documents", onDelete: "CASCADE" });
Document.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasOne(Preference, { foreignKey: "userId", as: "preferences", onDelete: "CASCADE" });
Preference.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasMany(Purchase, { foreignKey: "userId", as: "purchases", onDelete: "CASCADE" });
Purchase.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasMany(Share, { foreignKey: "ownerId", as: "ownedShares", onDelete: "CASCADE" });
Share.belongsTo(User, { foreignKey: "ownerId", as: "owner" });

User.hasMany(Share, { foreignKey: "recipientId", as: "receivedShares" });
Share.belongsTo(User, { foreignKey: "recipientId", as: "recipient" });

Document.hasMany(Share, { foreignKey: "documentId", as: "shares", onDelete: "CASCADE" });
Share.belongsTo(Document, { foreignKey: "documentId", as: "document" });

export { sequelize, User, Document, Preference, Purchase, Share };
