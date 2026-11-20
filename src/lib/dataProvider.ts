import { isFirebaseBackend } from "./envConfig";
import * as pocketbaseQuizTasks from "./providers/pocketbase/quizTasks";
import * as firebaseQuizTasks from "./providers/firebase/quizTasks";
import * as pocketbaseUserProfiles from "./providers/pocketbase/userProfiles";
import * as firebaseUserProfiles from "./providers/firebase/userProfiles";
import * as pocketbaseEssayExamples from "./providers/pocketbase/essayExamples";
import * as firebaseEssayExamples from "./providers/firebase/essayExamples";

export function getQuizTasksProvider() {
  return isFirebaseBackend() ? firebaseQuizTasks : pocketbaseQuizTasks;
}

export function getUserProfilesProvider() {
  return isFirebaseBackend() ? firebaseUserProfiles : pocketbaseUserProfiles;
}

export function getEssayExamplesProvider() {
  return isFirebaseBackend() ? firebaseEssayExamples : pocketbaseEssayExamples;
}
