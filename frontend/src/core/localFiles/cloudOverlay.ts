import { createDocument } from "../api"
import { getDocumentShares, createShare, revokeShare } from "../api"
import type { ShareRecord } from "../api"
import { PROJECT_RECORD_TYPE } from "../state/versioning"
import type { Project } from "../utils/projects"

export async function uploadProjectAsCloudDocument(token: string, project: Project): Promise<string> {
  const document = await createDocument(token, {
    title: project.name,
    content: JSON.stringify({ ...project, source: "cloud" }),
    metadata: {
      recordType: PROJECT_RECORD_TYPE,
      projectId: project.id,
    },
    theme: {
      projectColor: project.color,
    },
  })
  return document.id
}

export { getDocumentShares, createShare, revokeShare }
export type { ShareRecord }
