// The actual component is colocated with the existing family route so accepted
// native Node test loaders do not need a new TSX import hook. This is the public
// typed entry point to that same implementation, not a second UI or placeholder.
export {LoopRequestStatus as default} from './LoopFamilyHome';
export type {QueueStatusProps} from './LoopFamilyHome';
