import type * as Effect from "effect/Effect";
import * as ServiceMap from "effect/ServiceMap";
import type * as Stream from "effect/Stream";

import { type Feedback } from "./Feedback.js";
import {
	type AbsolutePath,
	type CliAgent,
	type FileQuery,
	type Pattern,
	type RelativePath,
	type Scope,
	type Tag,
	type WorkspacePath,
} from "./Models.js";

/**
 * @group Options
 */
export interface SearchOptions {
	/**
	 * @default workspace.rootDir
	 */
	readonly dir?: AbsolutePath | undefined;
}

/**
 * @group Options
 */
export interface DescribeOptions {
	/**
	 * @default 'all'
	 */
	readonly scope?: Scope | undefined;
}

/**
 * @group Options
 */
export interface SyncOptions {
	/**
	 * @default workspace.rootDir
	 */
	readonly dir?: AbsolutePath | undefined;
	/**
	 * @default - Все возможные теги
	 */
	readonly tags?: ReadonlyArray<Tag> | undefined;
}

/**
 * @group Options
 */
export interface ReviewOptions {
	/**
	 * Какого cli агента использовать
	 * @default - Тот, который есть в системе в порядке константы CONTEXT0_DEFAULT_CLI_AGENTS
	 */
	readonly cliAgent?: CliAgent | undefined;
	/**
	 * Файл, для которого нужно провести ревью
	 * @default undefined
	 */
	readonly file?: AbsolutePath | undefined;
	/**
	 * Папка, в которой нужно проводить ревью
	 * @default workspace.rootDir
	 */
	readonly dir?: AbsolutePath | undefined;
	/**
	 * Фильтр по файлам, фидбек по которым нужно получить
	 * @default - Все доступные файлы
	 */
	readonly query?: FileQuery | undefined;
	/**
	 * Сколько параллельно файлов можно ревьюить
	 * @default 10
	 */
	readonly parallel?: number | undefined;
	/**
	 * Обновлять ли ранее сгенерированный фидбек. Если false, то для файлов, которые не были изменены
	 * фидбек переиспользуется старый
	 * @default false
	 */
	readonly refresh?: boolean | undefined;
}

/**
 * @group Options
 */
export type PlanOptions = Pick<
	ReviewOptions,
	"dir" | "query" | "refresh" | "file"
>;

/**
 * @group Types
 */
export interface DescribeReturnType {
	readonly tags: ReadonlyArray<{
		readonly name: Tag;
		readonly description: string;
	}>;
	readonly context: ReadonlyArray<{
		readonly path: WorkspacePath;
		readonly scope: Scope;
		readonly description: string;
	}>;
}

/**
 * @group Types
 */
export interface ReviewReturnType {
	readonly path: WorkspacePath | RelativePath;
	readonly feedback: Feedback;
}

/**
 * @group Types
 */
export interface PlanReturnType<
	Path extends WorkspacePath | RelativePath = WorkspacePath | RelativePath,
> {
	readonly reviewedWithFeedback: ReadonlyArray<{
		readonly path: Path;
		readonly contextFiles: ReadonlyArray<WorkspacePath>;
	}>;
	readonly reviewedWithoutFeedback: ReadonlyArray<{
		readonly path: Path;
		readonly contextFiles: ReadonlyArray<WorkspacePath>;
	}>;
	readonly pending: ReadonlyArray<{
		readonly path: Path;
		readonly contextFiles: ReadonlyArray<WorkspacePath>;
	}>;
}

/**
 * @group Types
 */
export interface CheckReturnType {
	readonly isAllowed: boolean;
	readonly allowedDirs: ReadonlyArray<Pattern>;
	readonly allowedFiles: ReadonlyArray<RelativePath>;
	readonly requiredTags: ReadonlyArray<Tag>;
	readonly prohibitedTags: ReadonlyArray<Tag>;
}

/**
 * @group Services
 */
export class Context0 extends ServiceMap.Service<
	Context0,
	{
		readonly search: (
			query: FileQuery,
			options?: SearchOptions,
		) => Effect.Effect<
			ReadonlyArray<WorkspacePath> | ReadonlyArray<RelativePath>
		>;
		readonly describe: (
			file: AbsolutePath,
			options?: DescribeOptions,
		) => Effect.Effect<DescribeReturnType>;
		readonly check: (path: AbsolutePath) => Effect.Effect<CheckReturnType>;
		readonly review: (
			options?: ReviewOptions,
		) => Effect.Effect<Stream.Stream<ReviewReturnType>>;
		readonly plan: (
			options?: PlanOptions,
		) => Effect.Effect<
			PlanReturnType<WorkspacePath> | PlanReturnType<RelativePath>
		>;
		readonly sync: (options?: SyncOptions) => Effect.Effect<void>;
	}
>()("Context0") {}
