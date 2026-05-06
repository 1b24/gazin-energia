"use client";

/**
 * Formulário genérico dirigido por config de campos + schema Zod.
 *
 * O caller (página de entidade na Tarefa 4) descreve os campos via `fields`
 * e passa o `schema` Zod pra validação. O form usa React Hook Form +
 * `@hookform/resolvers/zod`. Suporta `create` e `edit` via prop `defaultValues`.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { Paperclip, Upload, X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  Controller,
  useForm,
  type DefaultValues,
  type Resolver,
} from "react-hook-form";
import type { z } from "zod";

import { uploadFile } from "@/lib/actions/upload";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { maskCNPJ, maskCurrencyBR, maskDateBR } from "./masks";

export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "currency"
  | "date"
  | "boolean"
  | "select"
  | "cnpj"
  | "file";

export interface FormFieldConfig {
  name: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: { value: string; label: string }[]; // para `select`
  /** colspan: 1 = metade, 2 = inteira (grid de 2 colunas no desktop) */
  span?: 1 | 2;
  /** Para `file`: subpasta dentro de `public/uploads/`. Default = "default". */
  bucket?: string;
  /** Para `file`: tipos aceitos (atributo `accept` do input). */
  accept?: string;
}

export interface EntityFormProps<S extends z.ZodObject> {
  schema: S;
  fields: FormFieldConfig[];
  defaultValues?: DefaultValues<z.infer<S>>;
  /** Async action — server action ou client. Recebe values já parseados. */
  onSubmit: (values: z.infer<S>) => Promise<void> | void;
  submitLabel?: string;
  onCancel?: () => void;
  cancelLabel?: string;
}

export function EntityForm<S extends z.ZodObject>({
  schema,
  fields,
  defaultValues,
  onSubmit,
  submitLabel = "Salvar",
  onCancel,
  cancelLabel = "Cancelar",
}: EntityFormProps<S>) {
  const [pending, startTransition] = useTransition();

  // zodResolver + Zod 4 + RHF 7: as discrepâncias de tipos internos não são
  // expressáveis sem cast — a validação real continua a cargo do Zod em runtime.
  type FormValues = z.infer<S>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolver = zodResolver(schema as any) as unknown as Resolver<FormValues>;
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver, defaultValues });

  const submit = (values: FormValues) => {
    startTransition(async () => {
      await onSubmit(values);
    });
  };

  const busy = pending || isSubmitting;

  return (
    <form
      onSubmit={handleSubmit(submit)}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      {fields.map((f) => {
        const errMsg = (errors as Record<string, { message?: string } | undefined>)[f.name]?.message;
        const colSpan = f.span === 2 ? "sm:col-span-2" : "";
        return (
          <div key={f.name} className={cn("flex flex-col gap-1.5", colSpan)}>
            <Label htmlFor={f.name}>
              {f.label}
              {f.required && <span className="ml-0.5 text-destructive">*</span>}
            </Label>

            {renderField(f, register, control)}

            {f.helpText && !errMsg && (
              <p className="text-xs text-muted-foreground">{f.helpText}</p>
            )}
            {errMsg && (
              <p className="text-xs text-destructive">{String(errMsg)}</p>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-end gap-2 sm:col-span-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Salvando..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ----------------------------------------------------------------------------
// Field renderer — extraído pra simplificar a leitura do form principal.
// ----------------------------------------------------------------------------

function renderField(
  f: FormFieldConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any,
) {
  switch (f.type) {
    case "text":
      return (
        <Input
          id={f.name}
          {...register(f.name)}
          placeholder={f.placeholder}
        />
      );

    case "textarea":
      return (
        <textarea
          id={f.name}
          {...register(f.name)}
          placeholder={f.placeholder}
          className="min-h-[88px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      );

    case "number":
      return (
        <Input
          id={f.name}
          type="number"
          step="any"
          {...register(f.name, { valueAsNumber: true })}
          placeholder={f.placeholder}
        />
      );

    case "boolean":
      return (
        <Controller
          control={control}
          name={f.name}
          render={({ field }) => (
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id={f.name}
                checked={!!field.value}
                onCheckedChange={(v) => field.onChange(!!v)}
              />
              <span className="text-sm text-muted-foreground">
                {f.placeholder ?? "Sim"}
              </span>
            </div>
          )}
        />
      );

    case "select":
      return (
        <Controller
          control={control}
          name={f.name}
          render={({ field }) => (
            <Select
              value={field.value ?? ""}
              onValueChange={(v) => field.onChange(v || null)}
            >
              <SelectTrigger id={f.name}>
                <SelectValue placeholder={f.placeholder ?? "Selecione..."} />
              </SelectTrigger>
              <SelectContent>
                {(f.options ?? []).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      );

    case "currency":
      return (
        <Controller
          control={control}
          name={f.name}
          render={({ field }) => (
            <Input
              id={f.name}
              inputMode="decimal"
              value={field.value ?? ""}
              onChange={(e) => field.onChange(maskCurrencyBR(e.target.value))}
              placeholder={f.placeholder ?? "0,00"}
            />
          )}
        />
      );

    case "date":
      return (
        <Controller
          control={control}
          name={f.name}
          render={({ field }) => (
            <Input
              id={f.name}
              inputMode="numeric"
              value={field.value ?? ""}
              onChange={(e) => field.onChange(maskDateBR(e.target.value))}
              placeholder={f.placeholder ?? "dd/mm/aaaa"}
            />
          )}
        />
      );

    case "cnpj":
      return (
        <Controller
          control={control}
          name={f.name}
          render={({ field }) => (
            <Input
              id={f.name}
              inputMode="numeric"
              value={field.value ?? ""}
              onChange={(e) => field.onChange(maskCNPJ(e.target.value))}
              placeholder={f.placeholder ?? "00.000.000/0000-00"}
            />
          )}
        />
      );

    case "file":
      return (
        <Controller
          control={control}
          name={f.name}
          render={({ field }) => (
            <FileField
              id={f.name}
              value={field.value as string | null | undefined}
              onChange={field.onChange}
              bucket={f.bucket ?? "default"}
              accept={f.accept}
            />
          )}
        />
      );
  }
}

// ----------------------------------------------------------------------------
// FileField — input de arquivo que sobe via server action e guarda só a URL.
// ----------------------------------------------------------------------------

function FileField({
  id,
  value,
  onChange,
  bucket,
  accept,
}: {
  id: string;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  bucket: string;
  accept?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File | null) => {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("bucket", bucket);
        const url = await uploadFile(fd);
        onChange(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha no upload");
      }
    });
  };

  const filename = value ? value.split("/").pop() : null;

  return (
    <div className="flex flex-col gap-1.5">
      {value ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5">
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 truncate text-sm hover:underline"
            title={value}
          >
            {filename}
          </a>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Remover arquivo"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={cn(
            "flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed bg-muted/20 px-3 py-4 text-sm text-muted-foreground transition-colors hover:bg-muted/40",
            pending && "pointer-events-none opacity-50",
          )}
        >
          <Upload className="h-4 w-4" />
          {pending ? "Enviando..." : "Clique para anexar arquivo"}
        </label>
      )}
      <input
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
