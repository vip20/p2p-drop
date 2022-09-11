<template>
  <div @drop.prevent="onDrop" @click="onClick">
    <slot></slot>

    <input type="file" ref="fileInputRef" hidden @change="onInputChange" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

const fileInputRef = ref<HTMLElement>();
const emit = defineEmits(["files-dropped", "error"]);

function onDrop(e: any) {
  if (e?.dataTransfer?.files?.length > 0) {
    emitFile(e.dataTransfer.files[0]);
  } else {
    emitError("File not selected");
  }
}
function onInputChange(e: any) {
  if (e?.target?.files?.length > 0) {
    emitFile(e?.target?.files[0]);
  } else {
    emitError("File not selected");
  }
}
function emitFile(file: File) {
  emit("files-dropped", file);
}
function emitError(msg: string) {
  emit("error", msg);
}
function onClick() {
  fileInputRef.value?.click();
}
function preventDefaults(e: any) {
  e.preventDefault();
}

const events = ["dragenter", "dragover", "dragleave", "drop"];

onMounted(() => {
  events.forEach((eventName) => {
    document.body.addEventListener(eventName, preventDefaults);
  });
});

onUnmounted(() => {
  events.forEach((eventName) => {
    document.body.removeEventListener(eventName, preventDefaults);
  });
});
</script>
