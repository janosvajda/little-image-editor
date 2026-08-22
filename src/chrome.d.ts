declare namespace chrome {
  namespace action {
    const onClicked: { addListener(callback: () => void): void };
  }
  namespace tabs {
    function create(options: { url: string }): Promise<unknown>;
  }
  namespace runtime {
    function getURL(path: string): string;
  }
}
