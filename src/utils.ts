export function removeItemOnce<T>(arr: T[], value: T): T[] {
    var index = arr.indexOf(value);
    if (index > -1) {
        arr.splice(index, 1);
    }
    return arr;
}
