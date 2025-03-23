import { Repository, SelectQueryBuilder } from "typeorm";
import { Product } from "../entities/product.entity";
import { Injectable, Inject, CACHE_MANAGER, InternalServerErrorException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { SearchDto } from "../dtos/search.dto";
import { FilterDto } from "../dtos/filter.dto";
import { Cache } from "cache-manager";

@Injectable()
export class ProductRepository {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache
  ) {}

  async searchProducts(searchDto: SearchDto, filterDto: FilterDto) {
    const {
      query,
      sortBy,
      order = "ASC",
      page = 1,
      limit = 10,
      fields,
    } = searchDto;

    const { category, minPrice, maxPrice, brand } = filterDto;

    const cacheKey = `products:${JSON.stringify(searchDto)}:${JSON.stringify(filterDto)}`;

    try {
    
      const cachedData = await this.cacheManager.get(cacheKey);
      if (cachedData) return cachedData;

      let queryBuilder: SelectQueryBuilder<Product> = this.productRepo.createQueryBuilder("product");

     
      if (query) {
        queryBuilder.andWhere(
          "product.name ILIKE :query OR product.description ILIKE :query",
          { query: `%${query}%` }
        );
      }
      if (category) queryBuilder.andWhere("product.category = :category", { category });
      if (brand) queryBuilder.andWhere("product.brand = :brand", { brand });
      if (minPrice) queryBuilder.andWhere("product.price >= :minPrice", { minPrice });
      if (maxPrice) queryBuilder.andWhere("product.price <= :maxPrice", { maxPrice });

    
      const allowedSortFields = ["name", "price", "createdAt"];
      if (sortBy && allowedSortFields.includes(sortBy)) {
        queryBuilder.orderBy(`product.${sortBy}`, order === "DESC" ? "DESC" : "ASC");
      }

   
      const offset = (page - 1) * limit;
      queryBuilder.skip(offset).take(limit);

    
      if (fields) {
        const selectedFields = fields.split(",").map((field) => `product.${field.trim()}`);
        queryBuilder.select(selectedFields);
      } else {
        queryBuilder.select([
          "product.id",
          "product.name",
          "product.price",
          "product.category",
        ]);
      }

     
      const [products, total] = await queryBuilder.getManyAndCount();

      const result = { products, total, page, limit };

  
      await this.cacheManager.set(cacheKey, result, { ttl: 600 });

      return result;
    } catch (error) {
      console.error("Error executing product search query:", error);
      throw new InternalServerErrorException("Failed to execute product search...");
    }
  }
}
