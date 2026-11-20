import { isFirebaseBackend } from "./envConfig";
import * as pocketbaseQuizTasks from "./providers/pocketbase/quizTasks";
import * as firebaseQuizTasks from "./providers/firebase/quizTasks";

export function getQuizTasksProvider() {
  return isFirebaseBackend() ? firebaseQuizTasks : pocketbaseQuizTasks;
}
