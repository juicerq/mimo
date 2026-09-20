const CLUSTERS = new Intl.Segmenter();
const WIDE = /^(?:\p{Extended_Pictographic}|[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6])/u;

function clusterCols(cluster: string): number {
	if (WIDE.test(cluster)) {
		return 2;
	}
	return 1;
}

function cols(text: string): number {
	let total = 0;
	for (const { segment } of CLUSTERS.segment(text)) {
		total += clusterCols(segment);
	}
	return total;
}

export function cut(text: string, width: number): string {
	if (cols(text) <= width) {
		return text;
	}
	let kept = "";
	let total = 0;
	for (const { segment } of CLUSTERS.segment(text)) {
		total += clusterCols(segment);
		if (total > width - 1) {
			break;
		}
		kept += segment;
	}
	return `${kept}…`;
}
