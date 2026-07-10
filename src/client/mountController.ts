export interface MountController {
	enter(mountModel: Model): void;
	exit(): void;
}
