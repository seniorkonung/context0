import * as Array from "effect/Array";
import * as Filter from "effect/Filter";
import { identity, pipe } from "effect/Function";
import * as Graph from "effect/Graph";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Record from "effect/Record";
import * as Result from "effect/Result";

import {
	CyclicTagDependency,
	DuplicateTagDefinition,
	UnresolvedTagDependency,
} from "./Errors.js";
import {
	type AbsolutePath,
	type CheckStep,
	type ConfigGroup,
	type EntrypointConfig,
	type RootConfig,
	Tag,
} from "./Models.js";
import { type Workspace } from "./Workspace.js";

/**
 * @group Models
 */
export interface ConfigResolver {
	readonly _tag: "ConfigResolver";
	readonly groups: ReadonlyArray<ConfigGroup>;
}

/**
 * @group Constructors
 */
export const build = (
	workspace: Workspace,
): Result.Result<
	ConfigResolver,
	CyclicTagDependency | DuplicateTagDefinition | UnresolvedTagDependency
> => {
	const computeApplicableConfigs = (
		targetDir: AbsolutePath,
	): ReadonlyArray<RootConfig | EntrypointConfig> => {
		return pipe(
			workspace.entrypoints,
			Array.filter(({ dir }) => targetDir.startsWith(dir)),
			Array.flatMap(({ config }) => Array.fromOption(config)),
			Array.prependAll(Array.fromOption(workspace.rootConfig)),
		);
	};

	const findAllExplicitDeps = (
		checks: ReadonlyArray<CheckStep>,
	): ReadonlyArray<Tag> => {
		return pipe(
			checks,
			Array.reduce([] as ReadonlyArray<Tag>, (acc, checkStep) =>
				pipe(
					acc,
					Array.appendAll("tags" in checkStep ? checkStep.tags : []),
					Array.appendAll(
						"not" in checkStep ? findAllExplicitDeps([checkStep.not]) : [],
					),
					Array.appendAll(
						"allOf" in checkStep ? findAllExplicitDeps(checkStep.allOf) : [],
					),
					Array.appendAll(
						"anyOf" in checkStep ? findAllExplicitDeps(checkStep.anyOf) : [],
					),
					Array.appendAll(
						"oneOf" in checkStep ? findAllExplicitDeps(checkStep.oneOf) : [],
					),
					Array.appendAll(
						"noneOf" in checkStep ? findAllExplicitDeps(checkStep.noneOf) : [],
					),
					Array.appendAll(
						"if" in checkStep
							? findAllExplicitDeps([
									checkStep.if,
									checkStep.then,
									...Array.fromNullishOr(checkStep.else),
								])
							: [],
					),
				),
			),
		);
	};

	const findAllImplicitDeps = (tag: Tag): ReadonlyArray<Tag> => {
		return pipe(
			tag.split("/"),
			Array.reduce([] as ReadonlyArray<Tag>, (tags, segment) =>
				Array.append(
					tags,
					pipe(
						Array.last(tags),
						Option.map((last) => Tag.makeUnsafe(`${last}/${segment}`)),
						Option.getOrElse(() => Tag.makeUnsafe(segment)),
					),
				),
			),
			Array.dropRight(1),
		);
	};

	const step1 = pipe(
		workspace.entrypoints,
		Array.append({ dir: workspace.rootDir, config: workspace.rootConfig }),
		Array.map(({ dir }) => {
			const configs = computeApplicableConfigs(dir);
			return {
				dir,
				configs,
				tagMaps: pipe(
					configs,
					Array.filterMap(Filter.fromPredicateOption(({ tags }) => tags)),
					Array.map((tagMap) =>
						pipe(
							tagMap,
							Record.map(({ checks }) => findAllExplicitDeps(checks)),
							Record.map((deps, tag) =>
								Array.appendAll(deps, findAllImplicitDeps(tag)),
							),
						),
					),
				),
			};
		}),
	);

	for (const { tagMaps } of step1) {
		const definedTags = new Set<Tag>();

		for (const tag of Array.flatMap(tagMaps, Record.keys)) {
			if (definedTags.has(tag)) {
				return Result.fail(new DuplicateTagDefinition({ tag }));
			}
			definedTags.add(tag);
		}

		for (const [tag, deps] of Array.flatMap(tagMaps, Record.toEntries)) {
			for (const dep of deps) {
				if (definedTags.has(dep)) continue;
				return Result.fail(
					new UnresolvedTagDependency({
						tag: dep,
						referencedBy: tag,
					}),
				);
			}
		}
	}

	const step2 = pipe(
		step1,
		Array.map(({ dir, tagMaps, configs }) => {
			const tagMap = Array.reduce(
				tagMaps,
				{} as Record<Tag, ReadonlyArray<Tag>>,
				(acc, tags) => Record.union(acc, tags, identity),
			);

			const graph = Graph.directed<Tag, string>((mutable) => {
				const tags = Record.keys(tagMap);

				const nodeMap = pipe(
					tags,
					Array.map((tag) => {
						return [tag, Graph.addNode(mutable, tag)] as const;
					}),
					Record.fromEntries,
				);

				Array.forEach(tags, (tag) =>
					Array.forEach(tagMap[tag], (dep) =>
						Graph.addEdge(
							mutable,
							nodeMap[tag],
							nodeMap[dep],
							`${tag}->${dep}`,
						),
					),
				);
			});

			return {
				dir,
				configs,
				graph,
			};
		}),
	);

	for (const { graph } of step2) {
		if (Graph.isAcyclic(graph)) continue;
		return Result.fail(
			new CyclicTagDependency({
				cycles: Array.map(Graph.stronglyConnectedComponents(graph), (nodes) =>
					Array.map(nodes, (node) =>
						Option.getOrThrow(Graph.getNode(graph, node)),
					),
				),
			}),
		);
	}

	return Result.succeed({
		_tag: "ConfigResolver",
		groups: pipe(
			step2,
			Array.map(({ graph, dir, configs }) => {
				return {
					_tag: "ConfigGroup",
					rootDir: workspace.rootDir,
					dir,
					configs,
					tagMap: pipe(
						configs,
						Array.filterMap(Filter.fromPredicateOption(({ tags }) => tags)),
						Array.reduce(
							{} as Option.Option.Value<RootConfig["tags"]>,
							(acc, tagMap) => Record.union(acc, tagMap, identity),
						),
					),
					tagOrder: pipe(
						Graph.indices(Graph.topo(graph)),
						Array.fromIterable,
						Array.reverse,
						Array.map((nodeIndex) =>
							Option.getOrThrow(Graph.getNode(graph, nodeIndex)),
						),
					),
				} satisfies ConfigGroup;
			}),
			Array.sortWith(({ dir }) => dir, Order.flip(Order.String)),
		),
	});
};

/**
 * @group Accessors
 */
export const resolveGroup = (
	resolver: ConfigResolver,
	file: AbsolutePath,
): Option.Option<ConfigGroup> => {
	return Array.findFirst(resolver.groups, ({ dir }) => file.startsWith(dir));
};
