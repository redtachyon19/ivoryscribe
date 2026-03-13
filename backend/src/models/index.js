import sequelize from "../config/database.js";
import createUserModel from "./user.js";
import createDocumentModel from "./document.js";
import createPreferenceModel from "./preference.js";

const User = createUserModel(sequelize);
const Document = createDocumentModel(sequelize);
const Preference = createPreferenceModel(sequelize);

User.hasMany(Document, { foreignKey: "userId", as: "documents", onDelete: "CASCADE" });
Document.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasOne(Preference, { foreignKey: "userId", as: "preferences", onDelete: "CASCADE" });
Preference.belongsTo(User, { foreignKey: "userId", as: "user" });

export { sequelize, User, Document, Preference };
