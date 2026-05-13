"use client";

/**
 * Formulário genérico dirigido por config de campos + schema Zod.
 *
 * O caller (página de entidade na Tarefa 4) descreve os campos via `fields`
 * e passa o `schema` Zod pra validação. O form usa React Hook Form +
 * `@hookform/resolvers/zod`. Suporta `create` e `edit` via prop `defaultValues`.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Paperclip, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Controller,
  useForm,
  useWatch,
  type Control,
  type DefaultValues,
  type Resolver,
} from "react-hook-form";
import type { z } from "zod";

import { uploadFile } from "@/lib/actions/upload";
import { Button, buttonVariants } from "@/components/ui/button";
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

/** Item de `select` — pode carregar campos extras pra cross-field linking. */
export type FormFieldOption = {
  value: string;
  label: string;
} & Record<string, unknown>;

export interface FormFieldConfig {
  name: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: FormFieldOption[]; // para `select`
  /** colspan: 1 = metade, 2 = inteira (grid de 2 colunas no desktop) */
  span?: 1 | 2;
  /** Para `file`: subpasta dentro de `public/uploads/`. Default = "default". */
  bucket?: string;
  /** Para `file`: tipos aceitos (atributo `accept` do input). */
  accept?: string;
  /**
   * Para `select`: ao mudar, copia chaves arbitrárias da option escolhida pra
   * outros campos do form. Ex: `{ uc: "uc", municipio: "municipio" }` →
   * quando este field mudar, o form atualiza `uc` e `municipio` com os valores
   * `option.uc` e `option.municipio` da option selecionada.
   */
  linksTo?: Record<string, string>;
  /**
   * Renderização condicional — campo só aparece quando outro campo do form
   * tem o valor especificado. Quando escondido, valor é limpo (null) pra
   * evitar lixo no submit. Ex: `{ field: "origem", equals: "fornecedor" }`.
   */
  showWhen?: { field: string; equals: string | string[] };
  /**
   * Para `select`: mensagem mostrada quando `options` está vazio. Útil pra
   * orientar "vá cadastrar X primeiro" em vez de mostrar dropdown vazio.
   * Aceita JSX inline (link, ícone, etc.).
   */
  emptyMessage?: React.ReactNode;
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
  const resolver = zodResolver(
    schema as unknown as Parameters<typeof zodResolver>[0],
  ) as unknown as Resolver<FormValues>;
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver, defaultValues });

  // Observa todos os campos referenciados por `showWhen` em qualquer field.
  // useWatch sem nome retorna o form todo — pega só os campos referenciados
  // pra minimizar re-renders.
  const watchedNames = Array.from(
    new Set(
      fields
        .map((f) => f.showWhen?.field)
        .filter((n): n is string => !!n),
    ),
  );
  const watchedValues = useWatch({
    control: control as unknown as Control,
    name: watchedNames as never,
  }) as unknown[];
  const watchedMap = Object.fromEntries(
    watchedNames.map((n, i) => [n, watchedValues[i]]),
  );

  function fieldVisible(f: FormFieldConfig): boolean {
    if (!f.showWhen) return true;
    const current = watchedMap[f.showWhen.field];
    const expected = f.showWhen.equals;
    if (Array.isArray(expected)) return expected.includes(current as string);
    return current === expected;
  }

  // Quando um campo é escondido, limpa o valor — evita lixo no submit
  // (ex: usuário escolhe Distribuidora primeiro, preenche distribuidoraId,
  // muda Origem pra Fornecedor; o distribuidoraId deve sair do payload).
  useEffect(() => {
    for (const f of fields) {
      if (f.showWhen && !fieldVisible(f)) {
        setValue(f.name as never, null as never, { shouldDirty: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watchedMap)]);

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
        if (!fieldVisible(f)) return null;
        const errMsg = (
          errors as Record<string, { message?: string } | undefined>
        )[f.name]?.message;
        const colSpan = f.span === 2 ? "sm:col-span-2" : "";
        const isEmptySelect =
          f.type === "select" && (f.options?.length ?? 0) === 0;
        return (
          <div key={f.name} className={cn("flex flex-col gap-1.5", colSpan)}>
            <Label htmlFor={f.name}>
              {f.label}
              {f.required && <span className="ml-0.5 text-destructive">*</span>}
            </Label>

            {isEmptySelect && f.emptyMessage ? (
              <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {f.emptyMessage}
              </div>
            ) : (
              renderField(f, register, control, setValue)
            )}

            {f.helpText && !errMsg && !isEmptySelect && (
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: any,
) {
  switch (f.type) {
    case "text":
      return (
        <Input id={f.name} {...register(f.name)} placeholder={f.placeholder} />
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
              // base-ui: passa `items` pra que <SelectValue> mostre o label
              // do item selecionado em vez do raw value (ex: cuid de Filial).
              items={f.options ?? []}
              value={field.value ?? ""}
              onValueChange={(v) => {
                field.onChange(v || null);
                // Cross-field linking: copia chaves da option escolhida pra
                // outros campos do form.
                if (f.linksTo && v) {
                  const opt = (f.options ?? []).find((o) => o.value === v);
                  if (opt) {
                    for (const [optKey, formField] of Object.entries(
                      f.linksTo,
                    )) {
                      const val = opt[optKey];
                      // Não sobrescreve com undefined/null — preserva o que o
                      // user já tinha digitado se o source não tem o campo.
                      if (val != null && val !== "") {
                        setValue(formField, val, {
                          shouldDirty: true,
                          shouldValidate: false,
                        });
                      }
                    }
                  }
                }
              }}
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
  const inputRef = useRef<HTMLInputElement>(null);

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

  const trigger = () => inputRef.current?.click();

  const hasValue = !!value && value.trim().length > 0;
  // URL real (servida pelo Next ou externa) vs texto legado (ex: ID do Zoho).
  const isLink =
    !!value && (value.startsWith("/") || /^https?:\/\//.test(value));
  const href = value && isLink ? value : null;
  const filename = value ? value.split("/").pop() : null;

  return (
    <div className="flex flex-col gap-1.5">
      {hasValue ? (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/30 px-2.5 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate hover:underline"
                title={value!}
              >
                {filename}
              </a>
            ) : (
              <span
                className="flex-1 truncate text-xs italic text-muted-foreground"
                title={value!}
              >
                {value} (legado — substitua para anexar arquivo)
              </span>
            )}
          </div>
          <div className="flex gap-1.5">
            {href && (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                Abrir
              </a>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={trigger}
              disabled={pending}
            >
              <Upload className="mr-1 h-3.5 w-3.5" />
              {pending ? "Enviando..." : "Substituir"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
              disabled={pending}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Remover
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={trigger}
          disabled={pending}
          className={cn(
            "flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed bg-muted/20 px-3 py-4 text-sm text-muted-foreground transition-colors hover:bg-muted/40",
            pending && "cursor-not-allowed opacity-50",
          )}
        >
          <Upload className="h-4 w-4" />
          {pending ? "Enviando..." : "Clique para anexar arquivo"}
        </button>
      )}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0] ?? null);
          // Reset pra permitir re-upload do mesmo arquivo.
          e.target.value = "";
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
